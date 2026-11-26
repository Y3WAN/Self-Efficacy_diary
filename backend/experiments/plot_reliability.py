"""reliability.py 결과로 보고서용 그래프를 만든다.

사용법 (backend 폴더에서):
    python -m experiments.plot_reliability

출력 (experiments/results/):
    fig_reliability_t03.png   서비스 설정(temperature 0.3)에서 일기별 원천 점수 평균 ± 표준편차, 10회 개별값
    fig_reliability_temp.png  temperature에 따른 원천별 평균 표준편차
"""
import csv
import statistics
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

RESULTS_DIR = Path(__file__).parent / "results"
RAW_PATH = RESULTS_DIR / "reliability_raw.csv"

SOURCES = [("m", "M 성취경험"), ("v", "V 대리경험"), ("p", "P 사회적 설득"), ("a", "A 정서 상태")]
COLORS = {"m": "#2a78d6", "v": "#eb6834", "p": "#1baf7a", "a": "#eda100"}
INK, INK2, GRID = "#1f1f1e", "#5f5e58", "#e4e3de"
SERVICE_TEMP = 0.3

plt.rcParams.update({
    "font.family": "Malgun Gothic",
    "axes.unicode_minus": False,
    "font.size": 10,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK2,
    "xtick.color": INK2,
    "ytick.color": INK2,
    "axes.spines.top": False,
    "axes.spines.right": False,
})


def load_rows() -> list[dict]:
    with RAW_PATH.open(encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["ok"] == "1"]
    seen, out = set(), []
    for r in rows:
        k = (r["diary_id"], r["temperature"], r["rep"])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def sd(vals: list[float]) -> float:
    return statistics.stdev(vals) if len(vals) > 1 else 0.0


def fig_service_temp(rows: list[dict]) -> None:
    rs = [r for r in rows if float(r["temperature"]) == SERVICE_TEMP]
    if not rs:
        return
    diaries = sorted({(r["diary_id"], r["diary_label"]) for r in rs})
    n_max = max(sum(1 for r in rs if r["diary_id"] == d) for d, _ in diaries)

    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=200)
    width = 0.18
    for si, (key, name) in enumerate(SOURCES):
        offset = (si - 1.5) * width
        for di, (did, _) in enumerate(diaries):
            vals = [float(r[f"score_{key}"]) for r in rs if r["diary_id"] == did]
            x = di + offset
            # 개별 회차 (같은 값이 겹치면 진하게 보임)
            ax.scatter([x] * len(vals), vals, s=14, color=COLORS[key], alpha=0.25,
                       linewidths=0, zorder=2)
            m, s = statistics.mean(vals), sd(vals)
            ax.errorbar(x, m, yerr=s, fmt="o", color=COLORS[key], ecolor=COLORS[key],
                        elinewidth=2, capsize=3, markersize=6,
                        markeredgecolor="white", markeredgewidth=1.2, zorder=3,
                        label=name if di == 0 else None)

    ax.set_xticks(range(len(diaries)))
    ax.set_xticklabels([f"{d}\n{label}" for d, label in diaries], color=INK)
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("AI 평가 점수 (0~1)")
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(ncol=4, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.2),
              fontsize=9, labelcolor=INK)
    ax.set_title(f"같은 일기를 {n_max}회 반복 분석했을 때의 원천별 점수 (temperature {SERVICE_TEMP})",
                 loc="left", color=INK, fontsize=11)
    fig.text(0.01, 0.01, "점: 평균, 막대: ±표준편차, 옅은 점: 회차별 결과 · 가상 일기, 모델 gpt-oss-120b",
             color=INK2, fontsize=8)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    out = RESULTS_DIR / "fig_reliability_t03.png"
    fig.savefig(out, facecolor="white")
    plt.close(fig)
    print(f"저장: {out}")


def fig_by_temperature(rows: list[dict]) -> None:
    temps = sorted({float(r["temperature"]) for r in rows})
    if len(temps) < 2:
        print("temperature가 2개 이상 모여야 두 번째 그래프를 그립니다.")
        return
    diaries = sorted({r["diary_id"] for r in rows})

    fig, ax = plt.subplots(figsize=(6.4, 4), dpi=200)
    ends = []
    for key, name in SOURCES:
        ys = []
        for t in temps:
            sds = []
            for d in diaries:
                vals = [float(r[f"score_{key}"]) for r in rows
                        if r["diary_id"] == d and float(r["temperature"]) == t]
                if len(vals) > 1:
                    sds.append(sd(vals))
            ys.append(statistics.mean(sds) if sds else float("nan"))
        ax.plot(temps, ys, color=COLORS[key], linewidth=2, marker="o", markersize=7,
                markeredgecolor="white", markeredgewidth=1.2, label=name)
        ends.append((ys[-1], name, COLORS[key]))

    # 오른쪽 끝 직접 라벨 (겹치지 않게 간격 조정)
    ends.sort()
    ymax = max(e[0] for e in ends)
    gap = ymax * 0.07 if ymax > 0 else 0.005
    placed = []
    for y, name, color in ends:
        if placed and y - placed[-1] < gap:
            y = placed[-1] + gap
        placed.append(y)
        ax.annotate(name, (temps[-1], y), xytext=(8, 0), textcoords="offset points",
                    va="center", fontsize=9, color=INK)

    ax.axvline(SERVICE_TEMP, color=INK2, linewidth=1, linestyle=(0, (3, 3)), zorder=0)
    ax.annotate("서비스 설정값", (SERVICE_TEMP, 0), xytext=(4, 4), textcoords="offset points",
                xycoords=("data", "axes fraction"), fontsize=8, color=INK2)
    ax.set_xticks(temps)
    ax.set_xlabel("temperature (높을수록 답변이 다양해짐)")
    ax.set_ylabel("평균 표준편차 (낮을수록 일관됨)")
    ax.set_ylim(bottom=0)
    ax.set_xlim(temps[0] - 0.05, temps[-1] + 0.3)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(frameon=False, fontsize=8, labelcolor=INK, loc="upper left")
    ax.set_title("temperature에 따른 AI 점수의 흔들림 (일기 5개 평균)", loc="left",
                 color=INK, fontsize=11)
    fig.tight_layout()
    out = RESULTS_DIR / "fig_reliability_temp.png"
    fig.savefig(out, facecolor="white")
    plt.close(fig)
    print(f"저장: {out}")


def main() -> None:
    rows = load_rows()
    fig_service_temp(rows)
    fig_by_temperature(rows)


if __name__ == "__main__":
    main()
