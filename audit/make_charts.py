"""Generate the charts used by both deliverables (same PNGs, identical numbers)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrowPatch

import findings_data as d

OUT = os.path.join(os.path.dirname(__file__), "charts")
os.makedirs(OUT, exist_ok=True)

NAVY = "#132a3f"
CHARCOAL = "#25313d"
BLUE = "#2f6fb0"
GREEN = "#2f7d5b"
AMBER = "#b07d24"
RED = "#a8443f"
GREY = "#c9d2db"
LIGHT = "#eef2f5"

STATUS_COLOR = {
    "Completed & Verified": GREEN,
    "Implemented, Not Verified": BLUE,
    "Partially Implemented": AMBER,
    "In Development": "#7a6aa8",
    "Not Started": RED,
    "Blocked": "#6d3d3d",
    "Needs Investigation": GREY,
}

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 11,
    "axes.edgecolor": "#b9c4ce",
    "axes.labelcolor": CHARCOAL,
    "text.color": CHARCOAL,
    "xtick.color": CHARCOAL,
    "ytick.color": CHARCOAL,
    "axes.spines.top": False,
    "axes.spines.right": False,
})


def save(fig, name):
    path = os.path.join(OUT, name)
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path


# 1. Progress: implementation vs verified -----------------------------------
def chart_progress():
    p = d.progress()
    fig, ax = plt.subplots(figsize=(9.2, 3.0))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 2)
    ax.axis("off")
    bars = [("Implementation progress", p["implementation_pct"], BLUE, 1.38),
            ("Verified completion progress", p["verified_pct"], GREEN, 0.62)]
    for label, value, color, y in bars:
        ax.add_patch(Rectangle((0, y - 0.26), 100, 0.52, facecolor=LIGHT, edgecolor="none"))
        ax.add_patch(Rectangle((0, y - 0.26), value, 0.52, facecolor=color, edgecolor="none"))
        ax.text(-1.4, y, label, ha="right", va="center", fontsize=11.5, color=NAVY, fontweight="bold")
        ax.text(value + 1.2, y, f"{value:.1f}%", ha="left", va="center", fontsize=13,
                color=color, fontweight="bold")
    ax.text(0, 0.12, f"Weighted across {len(d.FEATURES)} features (total weight {p['weight_total']}). "
                     "Unverified code is credited at 35% of its weight, partial features at 15%.",
            fontsize=8.6, color="#5b6a77")
    return save(fig, "progress.png")


# 2. Feature status distribution --------------------------------------------
def chart_status_dist():
    counts = d.status_counts()
    labels = [k for k in d.STATUS_ORDER if counts[k]]
    values = [counts[k] for k in labels]
    fig, ax = plt.subplots(figsize=(9.2, 3.4))
    y = range(len(labels))
    ax.barh(list(y), values, color=[STATUS_COLOR[l] for l in labels], height=0.6)
    ax.set_yticks(list(y))
    ax.set_yticklabels(labels, fontsize=10.5)
    ax.invert_yaxis()
    ax.set_xlabel("Number of features")
    ax.set_xlim(0, max(values) + 2)
    for i, v in enumerate(values):
        ax.text(v + 0.12, i, str(v), va="center", fontsize=11, fontweight="bold", color=NAVY)
    ax.grid(axis="x", color="#e6ebef", linewidth=0.8)
    ax.set_axisbelow(True)
    return save(fig, "status_dist.png")


# 3. Feature weight by status (stacked) -------------------------------------
def chart_weight_stack():
    agg = {}
    for _, status, w, _, _ in d.FEATURES:
        agg[status] = agg.get(status, 0) + w
    labels = [k for k in d.STATUS_ORDER if k in agg]
    fig, ax = plt.subplots(figsize=(9.2, 1.7))
    left = 0
    total = sum(agg.values())
    for k in labels:
        v = agg[k]
        ax.add_patch(Rectangle((left, 0), v, 1, facecolor=STATUS_COLOR[k], edgecolor="white", linewidth=1.5))
        if v / total > 0.09:
            ax.text(left + v / 2, 0.5, f"{k}\n{v} wt ({v/total*100:.0f}%)", ha="center", va="center",
                    fontsize=8.4, color="white", fontweight="bold")
        left += v
    ax.set_xlim(0, total); ax.set_ylim(0, 1); ax.axis("off")
    return save(fig, "weight_stack.png")


# 4. Technology / directory composition ------------------------------------
def chart_dirs():
    rows = [(n, c) for n, c, _ in d.TOP_DIRS]
    rows.sort(key=lambda r: r[1])
    fig, ax = plt.subplots(figsize=(9.2, 3.6))
    ax.barh([r[0] for r in rows], [r[1] for r in rows], color=BLUE, height=0.62)
    ax.set_xlabel("Tracked files")
    ax.grid(axis="x", color="#e6ebef", linewidth=0.8); ax.set_axisbelow(True)
    for i, (_, c) in enumerate(rows):
        ax.text(c + 0.15, i, str(c), va="center", fontsize=10, color=NAVY, fontweight="bold")
    ax.set_xlim(0, max(r[1] for r in rows) + 1.6)
    return save(fig, "dirs.png")


# 5. Code composition by language -----------------------------------------
def chart_loc():
    data = [("Python\n(backend + tests)", d.PY_LOC, NAVY),
            ("JavaScript\n(frontend + tests)", d.JS_LOC, BLUE),
            ("CSS", d.CSS_LOC, "#6f9fc4"),
            ("HTML", d.HTML_LOC, "#a8c4d8"),
            ("Docs / config\n(README, alembic, bat)", 611 + 446 + 148 + 56, GREY)]
    fig, ax = plt.subplots(figsize=(9.2, 1.9))
    total = sum(x[1] for x in data)
    left = 0
    for label, v, c in data:
        ax.add_patch(Rectangle((left, 0), v, 1, facecolor=c, edgecolor="white", linewidth=2))
        if v / total > 0.08:
            ax.text(left + v / 2, 0.5, f"{label}\n{v:,} lines ({v/total*100:.0f}%)", ha="center", va="center",
                    fontsize=8.6, color="white", fontweight="bold")
        left += v
    ax.set_xlim(0, total); ax.set_ylim(0, 1); ax.axis("off")
    return save(fig, "loc.png")


# 6. Risk matrix -----------------------------------------------------------
def chart_risk():
    order = ["Critical", "High", "Medium", "Low"]
    color = {"Critical": "#8c2f2b", "High": RED, "Medium": AMBER, "Low": "#6f8fa8"}
    fig, ax = plt.subplots(figsize=(9.2, 3.6))
    rows = []
    for sev in order:
        items = [r for r in d.RISKS if r[1] == sev]
        for r in items:
            rows.append((r[0], r[2], sev))
    ypos = list(range(len(rows)))[::-1]
    for y, (rid, title, sev) in zip(ypos, rows):
        ax.add_patch(Rectangle((0, y - 0.34), 10, 0.68, facecolor="#f7f9fb", edgecolor="none"))
        ax.add_patch(Rectangle((0, y - 0.34), 0.12, 0.68, facecolor=color[sev], edgecolor="none"))
        ax.text(0.3, y, rid, va="center", fontsize=9.5, fontweight="bold", color=NAVY)
        ax.text(1.0, y, title if len(title) < 68 else title[:65] + "…", va="center", fontsize=9.2)
        ax.text(9.85, y, sev, va="center", ha="right", fontsize=8.8, color=color[sev], fontweight="bold")
    ax.set_xlim(0, 10); ax.set_ylim(-0.6, len(rows) - 0.3); ax.axis("off")
    return save(fig, "risk.png")


# 7. Timeline --------------------------------------------------------------
def chart_timeline():
    rows = d.TIMELINE
    n = len(rows)
    fig, ax = plt.subplots(figsize=(9.4, 4.9))
    ax.set_xlim(0, 100); ax.set_ylim(-0.7, n - 0.3); ax.axis("off")
    palette = ["#8b9aa7", BLUE, AMBER, RED, BLUE, AMBER, BLUE, RED, RED, BLUE, GREEN, GREEN]
    ax.plot([17, 17], [n - 0.6, -0.4], color=GREY, linewidth=2.0, zorder=1)
    for i, (day, ref, text) in enumerate(rows):
        y = n - 1 - i
        ax.scatter([17], [y], s=70, color=palette[i % len(palette)], zorder=3,
                   edgecolor="white", linewidth=1.4)
        ax.text(15.4, y, day, ha="right", va="center", fontsize=8.0, color="#46555f")
        ax.text(18.8, y, text, ha="left", va="center", fontsize=8.4, color=NAVY)
        ax.text(99.6, y, ref, ha="right", va="center", fontsize=7.4, color="#7b8994")
        if i < n - 1:
            ax.axhline(y - 0.5, color="#f0f3f6", linewidth=0.9, zorder=0)
    return save(fig, "timeline.png")


# 8. Coverage: inspected vs total -----------------------------------------
def chart_coverage():
    fig, axes = plt.subplots(1, 3, figsize=(9.2, 2.5))
    specs = [("Files inspected", d.INSPECTED, d.FILE_COUNT, "%"),
             ("Repository inspection coverage", 100, 100, "%"),
             ("Lines inspected", d.INSPECTED_LINES_TOTAL, d.INSPECTED_LINES_TOTAL, "")]
    for ax, (label, val, total, unit) in zip(axes, specs):
        pct = 100.0 if total == 0 else val / total * 100
        ax.pie([val, max(total - val, 0.0001)], startangle=90,
               colors=[GREEN, "#e8edf1"], counterclock=False,
               wedgeprops=dict(width=0.30, edgecolor="white"))
        ax.text(0, 0.08, f"{pct:.0f}%", ha="center", va="center", fontsize=19, fontweight="bold", color=NAVY)
        ax.text(0, -0.24, f"{val:,}/{total:,} {unit}".strip(), ha="center", va="center", fontsize=8.4, color="#5b6a77")
        ax.set_title(label, fontsize=9.6, color=CHARCOAL, pad=6)
    return save(fig, "coverage.png")


# 9. Architecture diagram --------------------------------------------------
def chart_architecture():
    fig, ax = plt.subplots(figsize=(10.2, 5.6))
    ax.set_xlim(0, 104); ax.set_ylim(6, 74); ax.axis("off")

    def box(x, y, w, h, title, sub="", fc="#ffffff", ec="#b9c4ce", tc=NAVY, tsize=9.2, ssize=7.2):
        ax.add_patch(Rectangle((x, y), w, h, facecolor=fc, edgecolor=ec, linewidth=1.3))
        ax.text(x + w / 2, y + h - 3.8, title, ha="center", va="center", fontsize=tsize,
                fontweight="bold", color=tc)
        if sub:
            ax.text(x + w / 2, y + h - 6.4, sub, ha="center", va="top", fontsize=ssize,
                    color="#54636f", linespacing=1.45)

    def arrow(x1, y1, x2, y2, label="", color="#8b9aa7", dx=0, dy=0):
        ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=11,
                                     color=color, linewidth=1.3, shrinkA=1, shrinkB=1))
        if label:
            ax.text((x1 + x2) / 2 + dx, (y1 + y2) / 2 + dy, label, ha="center", va="center",
                    fontsize=6.6, color="#5b6a77",
                    bbox=dict(boxstyle="round,pad=0.18", facecolor="white", edgecolor="none"))

    # Row 1 — clients
    box(2, 60, 27, 12, "Browser SPA", "vanilla JS ES modules\nfrontend/src (15 files)", fc="#eef4fa")
    box(33, 60, 26, 12, "Public share page", "/share/{token}\nno session cookie", fc="#eef4fa")
    box(63, 60, 39, 12, "Owner application", "session JWT in localStorage · library, workspace,\nplayer, semantic search, Ask panel", fc="#eef4fa")

    # Row 2 — API
    box(2, 45, 100, 11, "FastAPI application   —   app/api/main.py   —   25 routes",
        "auth · upload · url-ingest · playback-token · HTTP-range streaming · jobs · search · chat\n"
        "delete · live sessions · share create/revoke · public share read · static mount (serves frontend/)",
        fc="#e7eef5", ec=BLUE, ssize=7.0)

    # Row 3 — processing
    box(2, 28, 33, 12, "Thread-pool worker",
        "WORKER_THREADS=1 (in-process)\npreprocess → transcribe → [diarize]\n→ caption → summarize → index",
        fc="#f3f0e8", ec=AMBER, tsize=9.0, ssize=6.9)
    box(37, 28, 32, 12, "Local ML runtime",
        "Whisper base · BLIP base · pyannote (optional)\nBGE-small embedder + MiniLM cross-encoder",
        fc="#f3f0e8", ec=AMBER, tsize=9.0, ssize=6.9)
    box(71, 28, 31, 12, "Ollama  (LLM)",
        "llama3.2:1b · OpenAI-compatible\nendpoint used by summary + chat",
        fc="#f3f0e8", ec=AMBER, tsize=9.0, ssize=6.9)

    # Row 4 — stores
    box(2, 11, 31, 12, "SQLite (default) / Postgres",
        "users · videos · processing_jobs\nvideo_shares", fc="#eaf3ee", ec=GREEN, tsize=8.9, ssize=7.0)
    box(36, 11, 31, 12, "Embedded Qdrant",
        "collection 'video_search'\none point per speech / visual chunk",
        fc="#eaf3ee", ec=GREEN, tsize=9.0, ssize=6.9)
    box(70, 11, 32, 12, "Local object storage",
        "data/storage · data/processed\ndata/videos · data/tmp  (all gitignored)",
        fc="#eaf3ee", ec=GREEN, tsize=8.9, ssize=6.9)

    # Browsers → API
    arrow(15.5, 60, 15.5, 56.4, "HTTPS")
    arrow(46, 60, 46, 56.4, "read-only")
    arrow(82, 60, 82, 56.4, "JWT")
    # API → worker
    arrow(18, 45, 18, 40.6, "submit job")
    # worker ↔ ML, ML → LLM
    arrow(35, 34, 37, 34, "stages")
    arrow(69, 34, 71, 34, "prompt")
    # worker → stores
    arrow(10, 28, 10, 23.4, "write", color="#6f9a83")
    arrow(30, 28, 45, 23.4, "upsert / query", color="#6f9a83", dx=-2, dy=-1)
    arrow(64, 28, 84, 23.4, "media", color="#6f9a83", dx=2, dy=-1)
    return save(fig, "architecture.png")


# 10. Readiness ladder -----------------------------------------------------
def chart_readiness():
    fig, ax = plt.subplots(figsize=(9.2, 2.2))
    levels = [("Internal developer testing", "YES", GREEN),
              ("QA / structured testing", "CONDITIONAL", AMBER),
              ("Staging", "NO", RED),
              ("Production", "NO", RED)]
    for i, (label, verdict, color) in enumerate(levels):
        x = i * 2.5
        ax.add_patch(Rectangle((x, 0), 2.3, 1.5, facecolor="#f7f9fb", edgecolor="#dde4ea"))
        ax.add_patch(Rectangle((x, 1.2), 2.3, 0.3, facecolor=color))
        ax.text(x + 1.15, 1.35, verdict, ha="center", va="center", fontsize=9.5, color="white", fontweight="bold")
        ax.text(x + 1.15, 0.55, label, ha="center", va="center", fontsize=8.6, color=NAVY, wrap=True)
    ax.set_xlim(-0.15, 10.05); ax.set_ylim(0, 1.6); ax.axis("off")
    return save(fig, "readiness.png")


if __name__ == "__main__":
    for fn in (chart_progress, chart_status_dist, chart_weight_stack, chart_dirs, chart_loc,
               chart_risk, chart_timeline, chart_coverage, chart_architecture, chart_readiness):
        print(fn())
