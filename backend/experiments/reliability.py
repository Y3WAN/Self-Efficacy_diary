"""AI 일기 분석 신뢰도(일관성) 실험.

같은 일기를 같은 조건으로 여러 번 분석했을 때 점수가 얼마나 흔들리는지 잰다.
- 실제 서비스와 똑같은 프롬프트(analysis_service.ANALYSIS_SYSTEM / ANALYSIS_USER)와 모델을 쓴다.
- 일기는 데모용 가상 일기(scripts/seed_demo.py)에서 성격이 다른 5개를 골랐다. 실제 개인정보 없음.
- temperature별로 반복 분석해 원천(M·V·P·A)별 평균·표준편차를 낸다. 서비스 설정값은 0.3.

사용법 (backend 폴더에서):
    python -m experiments.reliability                    # 기본: temperature 0.3, 0.0, 1.0 x 10회
    python -m experiments.reliability --temps 0.3 --reps 5
    railway run -s Self-Efficacy_diary python -m experiments.reliability   # Railway의 GROQ_API_KEY 사용

- 중간에 끊겨도 다시 실행하면 이미 끝난 (일기, temperature, 회차)는 건너뛴다.
- 결과: experiments/results/reliability_raw.csv (호출 1회 = 1행), reliability_summary.csv (평균·표준편차)
"""
import argparse
import csv
import json
import os
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

# 프롬프트만 가져오면 되므로 DB 설정이 없어도 import 되게 한다
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://unused/unused")
os.environ.setdefault("JWT_SECRET", "unused")

from groq import Groq, RateLimitError, APIStatusError  # noqa: E402

from app.services.analysis_service import ANALYSIS_SYSTEM, ANALYSIS_USER  # noqa: E402
from app.services.scoring import composite_score, parse_source_scores  # noqa: E402

# (id, 설명, 일기) — scripts/seed_demo.py 의 가상 일기
DIARIES = [
    ("D1", "실패·포기",
     "수학 숙제를 하려고 앉았는데 첫 문제부터 막혀서 그냥 덮었다. 나는 원래 수학을 못하는 것 같다. 하루 종일 기운이 없었다."),
    ("D2", "짧은 일기",
     "오늘은 짧게. 학원 갔다 와서 피곤했다."),
    ("D3", "또래 대리경험",
     "미션으로 받은 '문제 3개만 풀기'를 했다. 3개는 진짜 금방 끝났다. 친구 민지가 나도 그 부분 어려웠다고 해서 좀 안심됐다."),
    ("D4", "교사의 칭찬",
     "수학 선생님이 내가 낸 풀이를 보고 '과정을 잘 썼다'고 하셨다. 답은 틀렸는데도 칭찬받으니까 신기했다."),
    ("D5", "실패 후 재도전 성공",
     "어제 못 한 질문을 오늘은 메모에 적어서 갔다. 막상 물어보니 선생님이 엄청 자세히 알려주셨다. 별거 아니었다."),
]

SOURCES = ["m", "v", "p", "a"]
RESULTS_DIR = Path(__file__).parent / "results"
RAW_PATH = RESULTS_DIR / "reliability_raw.csv"
SUMMARY_PATH = RESULTS_DIR / "reliability_summary.csv"


def set_tag(tag: str) -> None:
    """결과 파일 이름에 태그를 붙인다 (예: v2 → reliability_v2_raw.csv). 이전 결과를 덮어쓰지 않기 위해."""
    global RAW_PATH, SUMMARY_PATH
    if tag:
        RAW_PATH = RESULTS_DIR / f"reliability_{tag}_raw.csv"
        SUMMARY_PATH = RESULTS_DIR / f"reliability_{tag}_summary.csv"
RAW_FIELDS = [
    "timestamp", "model", "diary_id", "diary_label", "temperature", "rep",
    "ok", "score_m", "score_v", "score_p", "score_a", "confidence", "composite",
    "failure_detected", "prompt_tokens", "completion_tokens", "latency_s", "error",
]


def clamp_score(data: dict, key: str) -> float:
    """analysis_service._score 와 같은 규칙 (이상값은 0.5, 0~1로 자름)."""
    try:
        value = float(data.get(key, 0.5))
    except (TypeError, ValueError):
        value = 0.5
    return max(0.0, min(1.0, value))


def load_done() -> set[tuple[str, float, int]]:
    if not RAW_PATH.exists():
        return set()
    with RAW_PATH.open(encoding="utf-8-sig", newline="") as f:
        return {(r["diary_id"], float(r["temperature"]), int(r["rep"]))
                for r in csv.DictReader(f) if r["ok"] == "1"}


def append_row(row: dict) -> None:
    new = not RAW_PATH.exists()
    with RAW_PATH.open("a", encoding="utf-8-sig" if new else "utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=RAW_FIELDS)
        if new:
            w.writeheader()
        w.writerow(row)


def analyze_once(client: Groq, model: str, text: str, temperature: float, max_retries: int = 6):
    messages = [
        {"role": "system", "content": ANALYSIS_SYSTEM},
        {"role": "user", "content": ANALYSIS_USER.format(diary_text=text)},
    ]
    delay = 10.0
    for attempt in range(max_retries):
        try:
            t0 = time.perf_counter()
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=temperature,
            )
            latency = time.perf_counter() - t0
            return json.loads(resp.choices[0].message.content), resp.usage, latency
        except RateLimitError as e:
            wait = delay
            retry_after = getattr(getattr(e, "response", None), "headers", {}).get("retry-after")
            if retry_after:
                try:
                    wait = float(retry_after) + 1
                except ValueError:
                    pass
            if wait > 600:
                raise RuntimeError(f"rate limit, {wait:.0f}초 대기 필요 (일일 한도 초과 가능성)") from e
            print(f"    rate limit → {wait:.0f}초 대기 (시도 {attempt + 1}/{max_retries})", flush=True)
            time.sleep(wait)
            delay = min(delay * 2, 120)
        except APIStatusError as e:
            if e.status_code >= 500 and attempt < max_retries - 1:
                time.sleep(delay)
                delay = min(delay * 2, 120)
                continue
            raise
    raise RuntimeError("재시도 횟수 초과")


def run(temps: list[float], reps: int, model: str) -> None:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        sys.exit("GROQ_API_KEY 가 없습니다. 환경변수로 넣거나 railway run 으로 실행하세요.")
    client = Groq(api_key=key)
    RESULTS_DIR.mkdir(exist_ok=True)
    done = load_done()
    total = len(temps) * reps * len(DIARIES)
    count = 0

    # 일부만 끝나도 결과가 고르게 모이도록: temperature → 회차 → 일기 순서
    for temp in temps:
        for rep in range(1, reps + 1):
            for did, label, text in DIARIES:
                count += 1
                if (did, temp, rep) in done:
                    continue
                row = {
                    "timestamp": datetime.now().isoformat(timespec="seconds"),
                    "model": model, "diary_id": did, "diary_label": label,
                    "temperature": temp, "rep": rep,
                }
                try:
                    data, usage, latency = analyze_once(client, model, text, temp)
                    # 서비스와 같은 규칙: 근거 없는 원천은 None(빈칸), 종합 점수는 근거 있는 원천만
                    parsed = parse_source_scores(data)
                    s = {k: parsed[k.upper()] for k in SOURCES}
                    conf = clamp_score(data, "confidence")
                    composite = composite_score(parsed)
                    raw_fail = data.get("failure_detected", False)
                    row.update({
                        "ok": 1,
                        **{f"score_{k}": "" if s[k] is None else round(s[k], 3) for k in SOURCES},
                        "confidence": round(conf, 3),
                        "composite": "" if composite is None else round(composite, 3),
                        "failure_detected": int(raw_fail is True or str(raw_fail).lower() == "true"),
                        "prompt_tokens": getattr(usage, "prompt_tokens", ""),
                        "completion_tokens": getattr(usage, "completion_tokens", ""),
                        "latency_s": round(latency, 2),
                        "error": "",
                    })
                    print(f"[{count}/{total}] T={temp} #{rep} {did} "
                          + " ".join(f"{k.upper()}={'-' if s[k] is None else format(s[k], '.2f')}" for k in SOURCES)
                          + " "
                          f"conf={conf:.2f}", flush=True)
                except Exception as e:  # 실패도 기록하고 계속 (재실행 시 다시 시도)
                    row.update({"ok": 0, "error": str(e)[:300]})
                    print(f"[{count}/{total}] T={temp} #{rep} {did} 실패: {e}", flush=True)
                    if "일일 한도" in str(e):
                        append_row(row)
                        print("일일 한도에 걸린 것 같아 중단합니다. 나중에 같은 명령으로 이어서 실행하세요.")
                        summarize()
                        return
                append_row(row)
    summarize()


def summarize() -> None:
    if not RAW_PATH.exists():
        return
    with RAW_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["ok"] == "1"]
    # 같은 (일기, temperature, 회차)가 중복되면 처음 것만
    seen, uniq = set(), []
    for r in rows:
        k = (r["diary_id"], r["temperature"], r["rep"])
        if k not in seen:
            seen.add(k)
            uniq.append(r)

    groups: dict[tuple, list[dict]] = {}
    for r in uniq:
        groups.setdefault((r["diary_id"], r["diary_label"], float(r["temperature"])), []).append(r)

    metrics = ["score_m", "score_v", "score_p", "score_a", "composite", "confidence"]
    out = []
    for (did, label, temp), rs in sorted(groups.items(), key=lambda x: (x[0][2], x[0][0])):
        rec = {"diary_id": did, "diary_label": label, "temperature": temp, "n": len(rs)}
        for m in metrics:
            # 빈칸 = 근거 없음 (v2부터). 근거가 있었던 회차만으로 통계를 내고, 근거 비율을 따로 기록
            vals = [float(r[m]) for r in rs if r[m] != ""]
            rec[f"{m}_evidence_rate"] = round(len(vals) / len(rs), 2)
            rec[f"{m}_mean"] = round(statistics.mean(vals), 3) if vals else ""
            rec[f"{m}_sd"] = round(statistics.stdev(vals), 3) if len(vals) > 1 else ""
            rec[f"{m}_min"] = round(min(vals), 3) if vals else ""
            rec[f"{m}_max"] = round(max(vals), 3) if vals else ""
        rec["failure_detected_rate"] = round(
            sum(int(r["failure_detected"]) for r in rs) / len(rs), 2)
        rec["reflected_rate"] = round(
            sum(float(r["confidence"]) >= 0.3 and r["composite"] != "" for r in rs) / len(rs), 2)
        out.append(rec)

    if not out:
        return
    with SUMMARY_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    print("\n=== 요약 (평균 ± 표준편차) ===")
    for rec in out:
        def fmt(key):
            mean = rec[f"{key}_mean"]
            if mean == "":
                return "근거없음"
            return f"{mean:.2f}±{rec[f'{key}_sd'] or 0:.2f}({rec[f'{key}_evidence_rate']:.0%})"
        parts = " ".join(f"{m.upper()}={fmt(f'score_{m}')}" for m in SOURCES)
        print(f"T={rec['temperature']} {rec['diary_id']}({rec['diary_label']}) n={rec['n']} {parts} "
              f"종합={fmt('composite')}")
    print(f"\n저장: {RAW_PATH}\n      {SUMMARY_PATH}")


def main() -> None:
    ap = argparse.ArgumentParser(description="AI 일기 분석 일관성 실험")
    ap.add_argument("--temps", default="0.3,0.0,1.0", help="쉼표로 구분 (서비스 설정값 0.3)")
    ap.add_argument("--reps", type=int, default=10)
    ap.add_argument("--model", default=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"))
    ap.add_argument("--summary-only", action="store_true", help="호출 없이 요약만 다시 계산")
    ap.add_argument("--tag", default="", help="결과 파일 이름 태그 (예: v2). 비우면 기존 파일 이름")
    args = ap.parse_args()
    set_tag(args.tag)
    if args.summary_only:
        summarize()
        return
    run([float(t) for t in args.temps.split(",")], args.reps, args.model)


if __name__ == "__main__":
    main()
