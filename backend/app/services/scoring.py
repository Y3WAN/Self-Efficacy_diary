"""4원천 점수 계산 규칙 (분석·대시보드·미션 선택이 함께 쓴다).

핵심 원칙: '일기에 근거가 없음'은 점수가 아니다.
- AI는 근거가 없는 원천을 null로 돌려준다.
- DB 점수 칸에는 화면 호환을 위해 0.5를 넣되, 근거가 있는 원천은 evidence_sources("MPA" 등)에 따로 기록한다.
- 종합 점수·추세·미션 대상 선택은 근거가 있는 원천만으로 계산한다.
"""
from datetime import date
from typing import Iterable, Optional

SOURCES = ("M", "V", "P", "A")
WEIGHTS = {"M": 0.4, "V": 0.2, "P": 0.2, "A": 0.2}
NEUTRAL = 0.5

# 확신도 가중 EMA: 그날 반영 비율 = EMA_ALPHA × 확신도
# 확신도 0.6(보통 길이의 일기)이면 0.3 → 기존 고정 α=0.3과 같고,
# 확신도가 높을수록 추세를 더 많이, 낮을수록 덜 움직인다.
EMA_ALPHA = 0.5

# 미션 대상을 고를 때 보는 기간
PROFILE_DAYS = 7


def parse_source_scores(data: dict) -> dict[str, Optional[float]]:
    """AI 응답에서 원천별 점수를 읽는다. null·누락·이상값은 None(근거 없음)."""
    out: dict[str, Optional[float]] = {}
    for src in SOURCES:
        raw = data.get(f"score_{src.lower()}")
        if raw is None or (isinstance(raw, str) and raw.strip().lower() in ("", "null", "none")):
            out[src] = None
            continue
        try:
            out[src] = max(0.0, min(1.0, float(raw)))
        except (TypeError, ValueError):
            out[src] = None
    return out


def _weighted_source_scores(scores: dict[str, Optional[float]]) -> dict[str, float]:
    return {s: WEIGHTS[s] * v for s, v in scores.items() if v is not None}


def composite_score(scores: dict[str, Optional[float]]) -> Optional[float]:
    """근거가 있는 원천만으로 가중 평균 (가중치는 다시 합이 1이 되게 맞춘다). 근거가 하나도 없으면 None."""
    weighted = _weighted_source_scores(scores)
    if not weighted:
        return None
    total_w = sum(WEIGHTS[s] for s in weighted)
    return round(sum(weighted.values()) / total_w, 2)


def source_contributions(scores: dict[str, Optional[float]], score: float) -> dict[str, float]:
    """가중 점수의 비례를 유지하면서 기여도 합을 반올림된 일일 종합 점수에 맞춘다."""
    weighted = _weighted_source_scores(scores)
    total = sum(weighted.values())
    return {
        s: score * (weighted.get(s, 0.0) / total) if total else 0.0
        for s in SOURCES
    }


def evidence_string(scores: dict[str, Optional[float]]) -> str:
    return "".join(s for s in SOURCES if scores.get(s) is not None)


def known_scores(analysis) -> dict[str, Optional[float]]:
    """DailyAnalysis 행에서 근거 있는 원천의 점수만 꺼낸다.

    evidence_sources가 없는 예전 데이터는 '0.5 = 근거 없음' 규칙으로 추정한다.
    """
    raw = {s: float(getattr(analysis, f"score_{s.lower()}")) for s in SOURCES}
    ev = getattr(analysis, "evidence_sources", None)
    if ev is None:
        return {s: (None if v == NEUTRAL else v) for s, v in raw.items()}
    return {s: (raw[s] if s in ev else None) for s in SOURCES}


def ema_step(prev: Optional[float], value: float, confidence: float) -> float:
    if prev is None:
        return value
    rate = max(0.0, min(1.0, EMA_ALPHA * confidence))
    return prev + rate * (value - prev)


def source_profile(analyses: Iterable, since: Optional[date] = None) -> dict[str, dict]:
    """원천별 확신도 가중 EMA (근거 있는 날만). analyses는 날짜 오름차순.

    since 이전 분석은 출발점(사전값)으로만 쓰고 days에는 세지 않는다.
    반환: {"M": {"score": 0.42 | None, "days": 3}, ...}
    """
    prof = {s: {"score": None, "days": 0} for s in SOURCES}
    for a in analyses:
        conf = float(a.confidence) if a.confidence is not None else 0.5
        for s, v in known_scores(a).items():
            if v is None:
                continue
            prof[s]["score"] = ema_step(prof[s]["score"], v, conf)
            if since is None or a.diary_date >= since:
                prof[s]["days"] += 1
    for s in SOURCES:
        if prof[s]["score"] is not None:
            prof[s]["score"] = round(prof[s]["score"], 3)
    return prof


def rank_sources_from_profile(prof: dict[str, dict]) -> list[str]:
    """미션 대상 원천 순서.

    1) 최근 근거가 있고 0.5 미만인 원천 (낮은 순)
    2) 약한 원천이 없으면 근거 있는 원천 중 가장 낮은 것 1개
    3) 최근 근거가 전혀 없는 원천 1개를 '탐색'용으로 뒤에 붙인다
       (AI가 몰라서 0.5인 원천을 약하다고 착각하지 않으면서도, 아예 버리지는 않기 위해)
    """
    recent = {s: p["score"] for s, p in prof.items() if p["score"] is not None and p["days"] > 0}
    weak = sorted((s for s, v in recent.items() if v < NEUTRAL), key=recent.get)
    if not weak and recent:
        weak = [min(recent, key=recent.get)]
    unknown = [s for s in SOURCES if s not in recent]
    if unknown:
        # 사전값(가입 설문 등)이 있으면 그중 낮은 것, 없으면 기본 순서
        prior = {s: prof[s]["score"] for s in unknown if prof[s]["score"] is not None}
        unknown.sort(key=lambda s: prior.get(s, 1.0))
        weak.append(unknown[0])
    return weak or ["M"]
