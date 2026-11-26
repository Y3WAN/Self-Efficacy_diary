"""paraphrase.py 결과로 발표용 그래프를 만든다 (한 장에 메시지 하나).

사용법 (backend 폴더에서):
    python -m experiments.plot_paraphrase

출력 (experiments/results/):
    fig_paraphrase_vs_temp.png  종합 점수 흔들림: 반복(T=0/0.3/1) vs 표현 바꿈
    fig_paraphrase_heatmap.png  일기 x 원천별, 표현에 따라 점수가 바뀐 폭
    fig_paraphrase_cases.png    표현에 민감했던 두 사례 (D3 P점수, D4 실패 감지)
"""
import csv
import statistics
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

RESULTS_DIR = Path(__file__).parent / "results"
PARA_PATH = RESULTS_DIR / "paraphrase_raw.csv"
REL_PATH = RESULTS_DIR / "reliability_raw.csv"

VARIANTS = ["원문", "구어체", "순서 바꿈", "음슴체", "문어체"]
SOURCES = [("score_m", "M\n성취"), ("score_v", "V\n대리"), ("score_p", "P\n설득"),
           ("score_a", "A\n정서"), ("composite", "종합")]

INK, INK2, MUTED = "#1f1f1e", "#6b6a64", "#d9d8d2"
ACCENT = "#2a78d6"

plt.rcParams.update({
    "font.family": "Malgun Gothic",
    "axes.unicode_minus": False,
    "font.size": 12,
    "text.color": INK,
    "axes.labelcolor": INK2,
    "xtick.color": INK,
    "ytick.color": INK,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.spines.left": False,
    "axes.edgecolor": MUTED,
    "figure.facecolor": "white",
})


def load(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f) if r["ok"] == "1"]


def sd(vals):
    return statistics.stdev(vals) if len(vals) > 1 else 0.0


def variant_means(rows, did, metric):
    return [statistics.mean(float(r[metric]) for r in rows
                            if r["diary_id"] == did and int(r["variant_idx"]) == vi)
            for vi in range(len(VARIANTS))]


def title(fig, main, sub):
    fig.text(0.04, 0.95, main, fontsize=16, fontweight="bold", va="top")
    fig.text(0.04, 0.875, sub, fontsize=11, color=INK2, va="top")


def save(fig, name):
    out = RESULTS_DIR / name
    fig.savefig(out, dpi=200)
    plt.close(fig)
    print(f"저장: {out}")


def fig_vs_temp(para, rel):
    diaries = sorted({r["diary_id"] for r in para})
    temps = sorted({float(r["temperature"]) for r in rel})
    labels, vals = [], []
    for t in temps:
        labels.append(f"같은 문장 반복 · T={t:g}")
        vals.append(statistics.mean(sd([float(r["composite"]) for r in rel
                                        if r["diary_id"] == d and float(r["temperature"]) == t])
                                    for d in diaries))
    labels.append("표현만 바꿈 · T=0")
    vals.append(statistics.mean(sd(variant_means(para, d, "composite")) for d in diaries))

    fig, ax = plt.subplots(figsize=(9, 4.6))
    fig.subplots_adjust(left=0.3, right=0.92, top=0.72, bottom=0.08)
    title(fig, "표현을 바꿔도 종합 점수는 거의 흔들리지 않는다",
          "종합 점수의 표준편차 (일기 5개 평균, 낮을수록 일관됨)")
    ys = list(range(len(vals)))[::-1]
    colors = [MUTED] * (len(vals) - 1) + [ACCENT]
    ax.barh(ys, vals, height=0.58, color=colors)
    for y, v in zip(ys, vals):
        ax.text(v + 0.0006, y, f"{v:.3f}", va="center", fontsize=12, color=INK)
    ax.set_yticks(ys)
    ax.set_yticklabels(labels)
    ax.tick_params(axis="y", length=0, pad=10)
    ax.set_xticks([])
    ax.spines["bottom"].set_visible(False)
    ax.set_xlim(0, max(vals) * 1.2)
    save(fig, "fig_paraphrase_vs_temp.png")


def fig_heatmap(para):
    diaries = sorted({(r["diary_id"], r["diary_label"]) for r in para})
    grid = []
    for did, _ in diaries:
        row = []
        for m, _ in SOURCES:
            mu = variant_means(para, did, m)
            row.append(max(mu) - min(mu))
        grid.append(row)

    cmap = LinearSegmentedColormap.from_list("blue", ["#f4f7fb", "#cfe0f5", "#6ea3e3", ACCENT, "#174a8c"])
    vmax = 0.2
    fig, ax = plt.subplots(figsize=(9, 5.2))
    fig.subplots_adjust(left=0.26, right=0.96, top=0.74, bottom=0.04)
    title(fig, "원천 점수는 최대 0.20까지 바뀌지만, 종합 점수는 0.06 이내",
          "표현만 바꾼 일기 5가지에서 점수가 바뀐 폭 (최고값과 최저값의 차이, 0~1 척도)")
    ax.imshow(grid, cmap=cmap, vmin=0, vmax=vmax, aspect="auto")
    for i, row in enumerate(grid):
        for j, v in enumerate(row):
            ax.text(j, i, "0" if v < 0.005 else f"{v:.2f}", ha="center", va="center", fontsize=13,
                    color="white" if v >= 0.12 else INK, fontweight="bold" if v >= 0.15 else "normal")
    ax.set_xticks(range(len(SOURCES)))
    ax.set_xticklabels([n for _, n in SOURCES])
    ax.xaxis.tick_top()
    ax.set_yticks(range(len(diaries)))
    ax.set_yticklabels([f"{d}  {lab}" for d, lab in diaries])
    ax.tick_params(length=0, pad=8)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xticks([x - 0.5 for x in range(1, len(SOURCES))], minor=True)
    ax.set_yticks([y - 0.5 for y in range(1, len(diaries))], minor=True)
    ax.grid(which="minor", color="white", linewidth=3)
    ax.tick_params(which="minor", length=0)
    save(fig, "fig_paraphrase_heatmap.png")


def fig_cases(para):
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.8))
    fig.subplots_adjust(left=0.06, right=0.98, top=0.68, bottom=0.12, wspace=0.25)
    title(fig, "애매한 문장에서는 어순·말투가 판단을 바꾼다",
          "같은 내용, 표현만 다른 일기 5가지 · 각 3회 분석 평균 (temperature 0)")
    xs = list(range(len(VARIANTS)))

    # D3: P 점수
    p = variant_means(para, "D3", "score_p")
    a1.bar(xs, p, width=0.6, color=[ACCENT if v >= 0.6 else MUTED for v in p])
    for x, v in zip(xs, p):
        a1.text(x, v + 0.015, f"{v:.2f}", ha="center", fontsize=12)
    a1.axhline(0.5, color=INK2, linewidth=1, linestyle=(0, (3, 3)))
    a1.text(4.45, 0.5, "중립\n(근거 없음)", fontsize=9, color=INK2, va="center", ha="left")
    a1.set_ylim(0, 0.85)
    a1.set_title("D3  \"친구도 어려웠다고 해서 안심\"\nP(사회적 설득) 점수",
                 loc="left", fontsize=12, color=INK, pad=12)

    # D4: 실패 감지
    rate = []
    for vi in xs:
        rs = [r for r in para if r["diary_id"] == "D4" and int(r["variant_idx"]) == vi]
        rate.append(100 * sum(int(r["failure_detected"]) for r in rs) / len(rs))
    a2.bar(xs, [max(v, 1.5) for v in rate], width=0.6,
           color=[ACCENT if v > 0 else MUTED for v in rate])
    for x, v in zip(xs, rate):
        a2.text(x, max(v, 1.5) + 3, f"{v:.0f}%", ha="center", fontsize=12)
    a2.set_ylim(0, 118)
    a2.set_title("D4  \"답은 틀렸는데도 칭찬받아 신기\"\n실패로 감지한 비율",
                 loc="left", fontsize=12, color=INK, pad=12)
    a2.annotate("'답은 틀렸는데도'를\n문장 맨 앞에 쓴 경우", (2.32, 70), xytext=(2.85, 70),
                fontsize=10, color=INK2, va="center",
                arrowprops=dict(arrowstyle="-", color=INK2, linewidth=1))

    for ax in (a1, a2):
        ax.set_xticks(xs)
        ax.set_xticklabels(VARIANTS)
        ax.tick_params(axis="x", length=0, pad=6)
        ax.set_yticks([])
    save(fig, "fig_paraphrase_cases.png")


def main():
    para = load(PARA_PATH)
    fig_vs_temp(para, load(REL_PATH))
    fig_heatmap(para)
    fig_cases(para)
    old = RESULTS_DIR / "fig_paraphrase_range.png"
    if old.exists():
        old.unlink()


if __name__ == "__main__":
    main()
