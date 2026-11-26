"""표현 바꾸기(paraphrase) 실험.

temperature를 0으로 고정해 무작위성을 최대한 없앤 뒤, 같은 내용의 일기를 표현만 바꿔
분석하면 4원천 점수가 얼마나 달라지는지 잰다.
- 일기 5개 x 표현 5가지(원문 + 바꿔쓰기 4종) x 3회 반복
- 같은 표현 3회 반복의 편차 = 남은 무작위성(샘플링 잡음)
- 표현끼리의 편차 = 문장 표현 때문에 생기는 편차 (이게 이 실험의 관심사)
- 바꿔쓰기는 사실·감정·등장인물을 더하거나 빼지 않고 말투·어순·어휘만 바꿨다.

사용법 (backend 폴더에서):
    railway run -s Self-Efficacy_diary python -m experiments.paraphrase
    python -m experiments.paraphrase --summary-only
결과: experiments/results/paraphrase_raw.csv, paraphrase_summary.csv
"""
import argparse
import csv
import os
import statistics
import sys
from datetime import datetime
from pathlib import Path

from experiments.reliability import analyze_once, clamp_score, SOURCES

from groq import Groq

VARIANTS = ["원문", "구어 풀어쓰기", "문장 순서 바꿈", "음슴체 축약", "문어체·동의어"]

DIARIES = {
    ("D1", "실패·포기"): [
        "수학 숙제를 하려고 앉았는데 첫 문제부터 막혀서 그냥 덮었다. 나는 원래 수학을 못하는 것 같다. 하루 종일 기운이 없었다.",
        "수학 숙제하려고 책상에 앉았다. 근데 첫 문제부터 안 풀려서 그냥 책을 덮어버렸다. 아무래도 나는 원래 수학을 못하나 보다. 오늘 하루 종일 기운이 없었다.",
        "하루 종일 기운이 없었다. 수학 숙제를 하려다가 첫 문제에서 막혀서 덮었는데, 나는 원래 수학을 못하는 것 같다.",
        "오늘 수학 숙제 시작했는데 첫 문제부터 막힘. 그냥 덮음. 난 원래 수학 못하는 듯. 종일 기운 없었음.",
        "수학 숙제를 하려고 했으나 첫 번째 문제부터 풀리지 않아 그만두었다. 나는 본래 수학에 소질이 없는 것 같다. 온종일 힘이 없었다.",
    ],
    ("D2", "짧은 일기"): [
        "오늘은 짧게. 학원 갔다 와서 피곤했다.",
        "오늘은 짧게 쓴다. 학원에 갔다가 돌아와서 피곤했다.",
        "학원 갔다 와서 피곤했다. 그래서 오늘은 짧게.",
        "오늘 짧게. 학원 다녀옴. 피곤함.",
        "오늘은 간단히 적는다. 학원에 다녀온 뒤 피로했다.",
    ],
    ("D3", "또래 대리경험"): [
        "미션으로 받은 '문제 3개만 풀기'를 했다. 3개는 진짜 금방 끝났다. 친구 민지가 나도 그 부분 어려웠다고 해서 좀 안심됐다.",
        "오늘 미션이 '문제 3개만 풀기'였는데 그걸 했다. 3개는 진짜 금방 끝났다. 그리고 친구 민지가 자기도 그 부분 어려웠다고 말해줘서 좀 안심이 됐다.",
        "친구 민지가 자기도 그 부분이 어려웠다고 해서 좀 안심됐다. 미션으로 받은 '문제 3개만 풀기'도 했는데, 3개는 진짜 금방 끝났다.",
        "미션 '문제 3개만 풀기' 함. 3개는 진짜 금방 끝남. 친구 민지도 그 부분 어려웠다고 해서 좀 안심됨.",
        "과제로 주어진 '문제 3개만 풀기'를 수행했다. 세 문제는 매우 빠르게 끝났다. 친구 민지도 그 부분이 어려웠다고 하여 다소 안심되었다.",
    ],
    ("D4", "교사의 칭찬"): [
        "수학 선생님이 내가 낸 풀이를 보고 '과정을 잘 썼다'고 하셨다. 답은 틀렸는데도 칭찬받으니까 신기했다.",
        "내가 낸 풀이를 보시고 수학 선생님이 '과정을 잘 썼다'고 말씀해 주셨다. 답은 틀렸는데도 칭찬을 받으니까 신기한 기분이었다.",
        "답은 틀렸는데도 칭찬받아서 신기했다. 수학 선생님이 내가 낸 풀이를 보고 '과정을 잘 썼다'고 하셨다.",
        "수학쌤이 내 풀이 보고 '과정 잘 썼다'고 하심. 답 틀렸는데 칭찬받으니 신기함.",
        "수학 선생님께서 내가 제출한 풀이를 보시고 '과정을 잘 썼다'고 평가하셨다. 정답은 아니었으나 칭찬을 받아 신기하였다.",
    ],
    ("D5", "실패 후 재도전 성공"): [
        "어제 못 한 질문을 오늘은 메모에 적어서 갔다. 막상 물어보니 선생님이 엄청 자세히 알려주셨다. 별거 아니었다.",
        "어제는 못 했던 질문을 오늘은 메모에 적어서 들고 갔다. 막상 물어보니까 선생님이 엄청 자세하게 알려주셨다. 별거 아니었다.",
        "별거 아니었다. 어제 못 한 질문을 오늘은 메모에 적어 가서 물어봤는데, 선생님이 엄청 자세히 알려주셨다.",
        "어제 못 한 질문, 오늘은 메모해서 감. 막상 물어보니 쌤이 엄청 자세히 알려주심. 별거 아니었음.",
        "전날 하지 못한 질문을 오늘은 메모로 정리해 갔다. 실제로 질문하니 선생님께서 매우 상세히 설명해 주셨다. 대단한 일이 아니었다.",
    ],
}

TEMPERATURE = 0.0
RESULTS_DIR = Path(__file__).parent / "results"
RAW_PATH = RESULTS_DIR / "paraphrase_raw.csv"
SUMMARY_PATH = RESULTS_DIR / "paraphrase_summary.csv"
RAW_FIELDS = [
    "timestamp", "model", "diary_id", "diary_label", "variant_idx", "variant", "rep",
    "ok", "score_m", "score_v", "score_p", "score_a", "confidence", "composite",
    "failure_detected", "latency_s", "error", "text",
]
METRICS = ["score_m", "score_v", "score_p", "score_a", "composite"]


def load_done() -> set[tuple[str, int, int]]:
    if not RAW_PATH.exists():
        return set()
    with RAW_PATH.open(encoding="utf-8-sig", newline="") as f:
        return {(r["diary_id"], int(r["variant_idx"]), int(r["rep"]))
                for r in csv.DictReader(f) if r["ok"] == "1"}


def append_row(row: dict) -> None:
    new = not RAW_PATH.exists()
    with RAW_PATH.open("a", encoding="utf-8-sig" if new else "utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=RAW_FIELDS)
        if new:
            w.writeheader()
        w.writerow(row)


def run(reps: int, model: str) -> None:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        sys.exit("GROQ_API_KEY 가 없습니다. railway run 으로 실행하세요.")
    client = Groq(api_key=key)
    RESULTS_DIR.mkdir(exist_ok=True)
    done = load_done()
    total = reps * len(DIARIES) * len(VARIANTS)
    count = 0
    for rep in range(1, reps + 1):
        for (did, label), texts in DIARIES.items():
            for vi, text in enumerate(texts):
                count += 1
                if (did, vi, rep) in done:
                    continue
                row = {"timestamp": datetime.now().isoformat(timespec="seconds"), "model": model,
                       "diary_id": did, "diary_label": label, "variant_idx": vi,
                       "variant": VARIANTS[vi], "rep": rep, "text": text}
                try:
                    data, _usage, latency = analyze_once(client, model, text, TEMPERATURE)
                    s = {k: clamp_score(data, f"score_{k}") for k in SOURCES}
                    raw_fail = data.get("failure_detected", False)
                    row.update({
                        "ok": 1, **{f"score_{k}": round(s[k], 3) for k in SOURCES},
                        "confidence": round(clamp_score(data, "confidence"), 3),
                        "composite": round(0.4 * s["m"] + 0.2 * (s["v"] + s["p"] + s["a"]), 3),
                        "failure_detected": int(raw_fail is True or str(raw_fail).lower() == "true"),
                        "latency_s": round(latency, 2), "error": "",
                    })
                    print(f"[{count}/{total}] #{rep} {did} {VARIANTS[vi]:<8} "
                          f"M={s['m']:.2f} V={s['v']:.2f} P={s['p']:.2f} A={s['a']:.2f}", flush=True)
                except Exception as e:
                    row.update({"ok": 0, "error": str(e)[:300]})
                    print(f"[{count}/{total}] #{rep} {did} {VARIANTS[vi]} 실패: {e}", flush=True)
                append_row(row)
    summarize()


def sd(vals: list[float]) -> float:
    return statistics.stdev(vals) if len(vals) > 1 else 0.0


def summarize() -> None:
    with RAW_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["ok"] == "1"]
    cells: dict[tuple, list[dict]] = {}
    for r in rows:
        cells.setdefault((r["diary_id"], r["diary_label"], int(r["variant_idx"])), []).append(r)

    out = []
    for (did, label) in DIARIES:
        rec = {"diary_id": did, "diary_label": label}
        for m in METRICS:
            per_var = [[float(r[m]) for r in cells.get((did, label, vi), [])] for vi in range(len(VARIANTS))]
            per_var = [v for v in per_var if v]
            means = [statistics.mean(v) for v in per_var]
            # 같은 표현 반복의 편차(합동 SD) vs 표현별 평균끼리의 편차
            rec[f"{m}_within_sd"] = round(statistics.mean([sd(v) ** 2 for v in per_var]) ** 0.5, 3)
            rec[f"{m}_between_sd"] = round(sd(means), 3)
            rec[f"{m}_range"] = round(max(means) - min(means), 3)
            for vi, mu in enumerate(means):
                rec[f"{m}_v{vi}"] = round(mu, 3)
        out.append(rec)

    with SUMMARY_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    print("\n=== 표현별 평균 점수 (T=0) ===")
    for rec in out:
        print(f"\n{rec['diary_id']} {rec['diary_label']}")
        for m in METRICS:
            vals = " ".join(f"{rec.get(f'{m}_v{vi}', float('nan')):.2f}" for vi in range(len(VARIANTS)))
            print(f"  {m[6:] if m != 'composite' else '종합':>4}: {vals}  | 반복SD={rec[f'{m}_within_sd']:.3f} "
                  f"표현SD={rec[f'{m}_between_sd']:.3f} 범위={rec[f'{m}_range']:.2f}")
    print("\n=== 일기 5개 평균 ===")
    for m in METRICS:
        w_ = statistics.mean(r[f"{m}_within_sd"] for r in out)
        b_ = statistics.mean(r[f"{m}_between_sd"] for r in out)
        print(f"  {m}: 반복SD={w_:.3f}  표현SD={b_:.3f}")
    print(f"\n저장: {RAW_PATH}\n      {SUMMARY_PATH}")


def main() -> None:
    ap = argparse.ArgumentParser(description="표현 바꾸기 실험 (T=0)")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--model", default=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"))
    ap.add_argument("--summary-only", action="store_true")
    args = ap.parse_args()
    if args.summary_only:
        summarize()
    else:
        run(args.reps, args.model)


if __name__ == "__main__":
    main()
