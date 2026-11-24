"""Build the executive review deck. One dataset, one story, 19 slides."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

import findings_data as d

NAVY = RGBColor(0x0F, 0x24, 0x38)
INK = RGBColor(0x1D, 0x2B, 0x37)
BODY = RGBColor(0x3B, 0x4A, 0x57)
MUTED = RGBColor(0x76, 0x86, 0x93)
BLUE = RGBColor(0x2F, 0x6F, 0xB0)
GREEN = RGBColor(0x1E, 0x6B, 0x4C)
AMBER = RGBColor(0xB0, 0x7D, 0x24)
RED = RGBColor(0xA8, 0x44, 0x3F)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
PAPER = RGBColor(0xF7, 0xF9, 0xFB)
LINE = RGBColor(0xDD, 0xE4, 0xEA)

STATUS_COLOR = {
    "Completed & Verified": GREEN,
    "Implemented, Not Verified": BLUE,
    "Partially Implemented": AMBER,
    "Not Started": RED,
}
SEV_COLOR = {"Critical": RED, "High": RED, "Medium": AMBER, "Low": BLUE}

W, H = Inches(13.333), Inches(7.5)
M = Inches(0.62)          # left margin
CW = W - 2 * M            # content width
FONT = "Calibri"


# --------------------------------------------------------------- primitives
def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def txbox(slide, l, t, w, h, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = 0; tf.margin_right = 0
    tf.margin_top = 0; tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    tf.paragraphs[0].alignment = align
    return tf


def para(tf, text, size=14, bold=False, color=BODY, space_after=6, space_before=0,
         first=False, align=None, italic=False, line=1.0):
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.space_after = Pt(space_after)
    p.space_before = Pt(space_before)
    p.line_spacing = line
    if align is not None:
        p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    r.font.name = FONT
    return p


def rect(slide, l, t, w, h, fill=None, line=None, line_w=1.0, shape=MSO_SHAPE.RECTANGLE,
         shadow=False):
    s = slide.shapes.add_shape(shape, l, t, w, h)
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid(); s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line; s.line.width = Pt(line_w)
    if not shadow:
        s.shadow.inherit = False
    s.text_frame.word_wrap = True
    return s


def rule(slide, l, t, w, color=LINE, weight=1.0):
    r = rect(slide, l, t, w, Emu(int(weight * 12700)), fill=color)
    return r


def eyebrow(slide, text, color=BLUE):
    tf = txbox(slide, M, Inches(0.40), CW, Inches(0.24))
    para(tf, text.upper(), size=10.5, bold=True, color=color, first=True, space_after=0)


def title(slide, text, sub=None, size=30):
    tf = txbox(slide, M, Inches(0.66), CW, Inches(0.62))
    para(tf, text, size=size, bold=True, color=NAVY, first=True, space_after=0)
    if sub:
        tf2 = txbox(slide, M, Inches(1.30), CW, Inches(0.5))
        para(tf2, sub, size=13.5, color=MUTED, first=True, space_after=0, line=1.15)
    rule(slide, M, Inches(1.86) if sub else Inches(1.34), Inches(1.5), BLUE, 2.6)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def pic_fit(slide, path, box_l, box_t, box_w, box_h):
    from PIL import Image
    iw, ih = Image.open(path).size
    scale = min(box_w / iw, box_h / ih)
    w, h = int(iw * scale), int(ih * scale)
    l = int(box_l + (box_w - w) / 2)
    t = int(box_t + (box_h - h) / 2)
    return slide.shapes.add_picture(path, l, t, w, h)


def chart_path(name):
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "charts", name)


def footer(slide, num, section=""):
    tf = txbox(slide, M, H - Inches(0.46), Inches(8.0), Inches(0.24))
    para(tf, "ClipSearch — Engineering Audit · 24 November 2026", size=8.5, color=MUTED,
         first=True, space_after=0)
    tf2 = txbox(slide, W - M - Inches(1.6), H - Inches(0.46), Inches(1.6), Inches(0.24),
                align=PP_ALIGN.RIGHT)
    para(tf2, f"{section}  {num}".strip(), size=8.5, color=MUTED, first=True, space_after=0,
         align=PP_ALIGN.RIGHT)


def kpi_card(slide, l, t, w, h, value, label, sub=None, accent=NAVY, value_size=34):
    rect(slide, l, t, w, h, fill=WHITE, line=LINE, line_w=0.9)
    rect(slide, l, t, Emu(int(0.045 * 914400)), h, fill=accent)
    label_top = max(t + Inches(0.58), t + h - Inches(0.80))
    tf = txbox(slide, l + Inches(0.24), t + Inches(0.18), w - Inches(0.4),
               label_top - t - Inches(0.28))
    para(tf, value, size=value_size, bold=True, color=accent, first=True, space_after=0)
    tf2 = txbox(slide, l + Inches(0.24), label_top, w - Inches(0.4), Inches(0.72))
    para(tf2, label, size=11.5, bold=True, color=INK, first=True, space_after=2, line=1.05)
    if sub:
        para(tf2, sub, size=9, color=MUTED, space_after=0, line=1.05)


def findings_list(slide, items, top=Inches(2.0), size=12.5, gap=0.66, color_marks=True,
                  width=None):
    y = top
    for i, (label, text) in enumerate(items):
        if color_marks:
            rect(slide, M, y + Inches(0.07), Inches(0.055), Inches(0.30), fill=BLUE)
        tf = txbox(slide, M + Inches(0.22), y, (width or CW) - Inches(0.22), Inches(0.62))
        p = para(tf, "", first=True, space_after=0, line=1.05)
        r = p.add_run(); r.text = label + "  "
        r.font.size = Pt(size); r.font.bold = True; r.font.color.rgb = INK; r.font.name = FONT
        r2 = p.add_run(); r2.text = text
        r2.font.size = Pt(size); r2.font.color.rgb = BODY; r2.font.name = FONT
        y += Inches(gap)
    return y


# ------------------------------------------------------------------- build
def build():
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    progress = d.progress()
    counts = d.status_counts()
    n = [0]

    def num():
        # slide index of the slide currently being built (it is the last one added)
        n[0] = len(prs.slides)
        return n[0]

    # ================================================== 1 TITLE
    s = blank(prs)
    rect(s, 0, 0, W, H, fill=NAVY)
    rect(s, 0, 0, Emu(int(0.09 * 914400)), H, fill=GREEN)
    tf = txbox(s, Inches(1.0), Inches(1.45), Inches(9.5), Inches(0.3))
    para(tf, "INDEPENDENT ENGINEERING AUDIT", size=12, bold=True,
         color=RGBColor(0x8F, 0xC9, 0xB6), first=True, space_after=0)
    tf = txbox(s, Inches(1.0), Inches(1.95), Inches(10.5), Inches(1.1))
    para(tf, "ClipSearch", size=64, bold=True, color=WHITE, first=True, space_after=0)
    tf = txbox(s, Inches(1.0), Inches(3.22), Inches(10.5), Inches(0.7))
    para(tf, "Project Progress — Executive Review", size=25,
         color=RGBColor(0xC7, 0xD3, 0xDD), first=True, space_after=0)
    rect(s, Inches(1.0), Inches(4.05), Inches(2.0), Emu(int(2.4 * 12700)), fill=GREEN)
    tf = txbox(s, Inches(1.0), Inches(4.45), Inches(10.0), Inches(1.4))
    para(tf, "An evidence-based assessment of what has been built, what demonstrably works,\n"
             "and what stands between this project and production.",
         size=15, color=RGBColor(0x9F, 0xB2, 0xC0), first=True, space_after=0, line=1.35)

    meta = [("Report date", "24 November 2026"),
            ("Commit audited", "295f566  ·  main"),
            ("Scope", "69 files · 7,786 lines · 25 commits"),
            ("Classification", "v1.0 final")]
    x = Inches(1.0)
    for k, v in meta:
        tf = txbox(s, x, Inches(6.25), Inches(2.6), Inches(0.5))
        para(tf, k.upper(), size=8, bold=True, color=RGBColor(0x6F, 0x86, 0x99), first=True,
             space_after=2)
        para(tf, v, size=10.5, color=RGBColor(0xD5, 0xDF, 0xE7), space_after=0)
        x += Inches(2.85)
    notes(s, "Purpose of this review: give a decision-maker an honest picture of the ClipSearch project "
             "in fifteen minutes. Every number in this deck comes from one evidence dataset built by "
             "reading all 69 tracked files, the full commit and pull-request history, and the connected "
             "Linear, Figma and Drive workspaces. Where evidence does not exist, the deck says so rather "
             "than estimating.")

    # ================================================== 2 BOTTOM LINE
    s = blank(prs)
    eyebrow(s, "The headline")
    title(s, "A strong application with a thin delivery layer")
    findings_list(s, [
        ("82.1% implemented, 57.0% verified.",
         "The code for most of the product exists and is good. Only the verified share has been proven to run."),
        ("The gap is process, not craft.",
         "No CI, no container, no working migration chain, no observability. Nothing happens automatically."),
        ("Seven features proven, five unproven.",
         "The features testable without a model download pass. The AI pipeline has never been executed by a test."),
        ("Not ready for staging or production.",
         "Ready for one developer to run locally today. That is a real achievement — just not a launch."),
    ], top=Inches(2.10), size=12.5, gap=1.06, width=Inches(8.35))
    # right verdict block
    bx = W - M - Inches(3.55)
    rect(s, bx, Inches(2.02), Inches(3.55), Inches(4.35), fill=PAPER, line=LINE)
    tf = txbox(s, bx + Inches(0.32), Inches(2.32), Inches(2.95), Inches(0.3))
    para(tf, "READINESS", size=9.5, bold=True, color=MUTED, first=True, space_after=10)
    stages = [("Internal dev", "YES", GREEN), ("Structured QA", "CONDITIONAL", AMBER),
              ("Staging", "NO", RED), ("Production", "NO", RED)]
    for i, (label, val, col) in enumerate(stages):
        y = Inches(2.72 + 0.72 * i)
        tf = txbox(s, bx + Inches(0.32), y, Inches(1.52), Inches(0.3))
        para(tf, label, size=11.5, color=INK, first=True, space_after=0)
        tfr = txbox(s, bx + Inches(1.86), y, Inches(1.34), Inches(0.3), align=PP_ALIGN.RIGHT)
        para(tfr, val, size=11.5, bold=True, color=col, first=True, space_after=0,
             align=PP_ALIGN.RIGHT)
    tf = txbox(s, bx + Inches(0.32), Inches(5.72), Inches(2.95), Inches(0.5))
    para(tf, "Verified percentages exclude anything not backed by an executed test.",
         size=8.5, italic=True, color=MUTED, first=True, space_after=0, line=1.15)
    footer(s, num(), "Headline")
    notes(s, "Lead with the tension: the engineering inside the code is better than the engineering around "
             "it. 82% of weighted scope has code behind it; 57% is backed by executed evidence. The 25-point "
             "gap is concentrated entirely in the AI pipeline, because those features need model downloads "
             "and network fetches that no test performs. Readiness ladder: developer-local yes, QA conditional, "
             "staging and production no.")

    # ================================================== 3 METRICS
    s = blank(prs)
    eyebrow(s, "Measurement")
    title(s, "Two progress numbers, deliberately separated",
          "Code that exists is not the same as code that works. Reporting one figure would hide that difference.")
    cards = [
        (f"{progress['implementation_pct']:.1f}%", "Implementation progress",
         "Weighted across 19 features (weight 123)", BLUE),
        (f"{progress['verified_pct']:.1f}%", "Verified completion",
         "Credited only where evidence exists", GREEN),
        (f"{d.COVERAGE_PCT:.0f}%", "Repository inspection",
         f"{d.INSPECTED} of {d.FILE_COUNT} files · {d.INSPECTED_LINES_TOTAL:,} lines", MUTED),
        ("2", "Critical risks",
         "R1 unverified pipeline · R2 no CI/CD", RED),
    ]
    cw, gap = Inches(2.95), Inches(0.14)
    x = M
    for val, label, sub, col in cards:
        kpi_card(s, x, Inches(2.25), cw, Inches(1.85), val, label, sub, col)
        x += cw + gap
    pic_fit(s, chart_path("progress.png"), M, Inches(4.28), CW, Inches(2.35))
    footer(s, num(), "Metrics")
    notes(s, "Implementation credits a feature fully when its code exists and is coherent. Verified credits "
             "an implemented-but-unproven feature at only 35% of its weight, a partial feature at 15%. The "
             "methodology is disclosed on the metrics slide in the report, and the sensitivity is stated "
             "explicitly: if unverified features were credited zero, verified completion would fall to about "
             "a third; if the pipeline were demonstrated working, it would rise to about 88%. One three-day "
             "test collapses that uncertainty.")

    # ================================================== 4 WHAT IT IS
    s = blank(prs)
    eyebrow(s, "The product")
    title(s, "What ClipSearch actually does",
          "A locally hosted video library and search engine. Every model runs on the user's machine; no cloud inference.")
    steps = [("Ingest", "Upload a file\nor paste a URL"),
             ("Extract", "ffmpeg: audio\n+ keyframes"),
             ("Understand", "Whisper speech,\nBLIP captions"),
             ("Reason", "Local LLM:\nsummary + chapters"),
             ("Index", "BGE embeddings\ninto Qdrant"),
             ("Retrieve", "Search, Ask with\ntimestamp citations")]
    bw, bgap = Inches(1.82), Inches(0.20)
    x = M
    for i, (head, body) in enumerate(steps):
        rect(s, x, Inches(2.35), bw, Inches(1.55), fill=PAPER, line=LINE)
        tf = txbox(s, x + Inches(0.16), Inches(2.50), bw - Inches(0.3), Inches(1.3))
        para(tf, f"{i+1:02d}", size=9, bold=True, color=BLUE, first=True, space_after=3)
        para(tf, head, size=13, bold=True, color=NAVY, space_after=4)
        para(tf, body, size=9.5, color=MUTED, space_after=0, line=1.2)
        if i < 5:
            ar = rect(s, x + bw + Inches(0.03), Inches(3.00), Inches(0.14), Inches(0.22),
                      fill=RGBColor(0xB9, 0xC6, 0xD2), shape=MSO_SHAPE.ISOSCELES_TRIANGLE)
            ar.rotation = 90
        x += bw + bgap
    tf = txbox(s, M, Inches(4.30), CW, Inches(0.4))
    para(tf, "What a user gets", size=10, bold=True, color=MUTED, first=True, space_after=6)
    outs = [("Search", "natural language across speech and visuals"),
            ("Ask", "questions answered with cited timestamps"),
            ("Share", "revocable read-only public links"),
            ("Play", "HTTP-range streaming with scoped tokens")]
    x = M
    for head, body in outs:
        tf = txbox(s, x, Inches(4.72), Inches(2.95), Inches(0.8))
        para(tf, head, size=13, bold=True, color=GREEN, first=True, space_after=2)
        para(tf, body, size=10.5, color=BODY, space_after=0, line=1.2)
        x += Inches(3.02)
    rect(s, M, Inches(5.70), CW, Inches(0.95), fill=RGBColor(0xEE, 0xF4, 0xFA))
    tf = txbox(s, M + Inches(0.28), Inches(5.86), CW - Inches(0.56), Inches(0.7))
    para(tf, "Zero infrastructure to operate: SQLite, embedded Qdrant, local disk. The whole application is "
             "one Python process serving one static frontend.",
         size=11.5, color=NAVY, first=True, space_after=0, line=1.2)
    footer(s, num(), "Product")
    notes(s, "Six pipeline stages, four user-facing capabilities. The important architectural point is that "
             "nothing external is required: no Redis, no vector database server, no S3, no cloud LLM. That is "
             "why it runs on a laptop in one command. It is also why it cannot scale past one process — the "
             "embedded vector store takes an exclusive lock on its directory.")

    # ================================================== 5 ARCHITECTURE
    s = blank(prs)
    eyebrow(s, "Architecture")
    title(s, "One process, two tiers, an embedded inference stack")
    pic_fit(s, chart_path("architecture.png"), M, Inches(1.60), CW, Inches(4.62))
    tf = txbox(s, M, Inches(6.32), CW, Inches(0.55))
    para(tf, "25 API routes in a single module  ·  one worker thread  ·  one shared Qdrant collection with "
             "payload-level tenant isolation  ·  static frontend served by the API itself",
         size=10.5, color=MUTED, first=True, space_after=0)
    footer(s, num(), "Architecture")
    notes(s, "Read left to right: browser, API, worker, model runtimes, persistence. Two details worth "
             "flagging. First, the thread pool replaced Celery and Redis, but kept a Celery-compatible "
             "delay() shim so no route code had to change — a genuinely clean refactor. Second, all users "
             "share one vector collection; isolation depends entirely on a payload filter. That is a "
             "deliberate, documented trade-off, and it is one of the few things in the repo with an "
             "adversarial test proving it holds.")

    # ================================================== 6 FEATURE MATRIX
    s = blank(prs)
    eyebrow(s, "Feature assessment")
    title(s, "Nineteen features, four statuses",
          "Weighting reflects user impact. Weights total 123 and drive both progress figures.")
    rows = d.FEATURES
    left = rows[:10]
    right = rows[10:]
    colw = (CW - Inches(0.3)) / 2
    for ci, block in enumerate((left, right)):
        x = M + ci * (colw + Inches(0.3))
        y = Inches(2.05)
        for name, status, weight, _, _ in block:
            col = STATUS_COLOR[status]
            rect(s, x, y, colw, Inches(0.42), fill=WHITE, line=LINE, line_w=0.75)
            rect(s, x, y, Inches(0.05), Inches(0.42), fill=col)
            tf = txbox(s, x + Inches(0.16), y + Inches(0.09), colw - Inches(1.12), Inches(0.28))
            para(tf, name, size=9.5, color=INK, first=True, space_after=0)
            tf2 = txbox(s, x + colw - Inches(0.80), y + Inches(0.09), Inches(0.62), Inches(0.28),
                        align=PP_ALIGN.RIGHT)
            para(tf2, f"w{weight}", size=9.5, bold=True, color=col, first=True, space_after=0,
                 align=PP_ALIGN.RIGHT)
            y += Inches(0.455)
    # legend
    y = Inches(6.74)
    x = M
    for label, col in [("Completed & Verified", GREEN), ("Implemented, Not Verified", BLUE),
                       ("Partially Implemented", AMBER), ("Not Started", RED)]:
        rect(s, x, y + Inches(0.045), Inches(0.13), Inches(0.13), fill=col)
        tf = txbox(s, x + Inches(0.21), y, Inches(2.4), Inches(0.22))
        para(tf, label, size=8.5, color=MUTED, first=True, space_after=0)
        x += Inches(2.85)
    footer(s, num(), "Features")
    notes(s, "The distribution is polarised in a revealing way. The seven verified features are exactly "
             "those testable without a model download. The five unverified ones require a model or a "
             "network fetch. So the verification gap is not random — it tracks the boundary of what is "
             "cheap to test. Green: auth, search, chat, streaming, sharing, library, share UI. Blue: upload "
             "pipeline, transcription, captioning, URL ingest, live backend.")

    # ================================================== 6b WEIGHT
    s = blank(prs)
    eyebrow(s, "Feature assessment")
    title(s, "Where the weight actually sits",
          "Verified weight is 54 of 123. Unverified weight is 40 — all of it in the AI pipeline that has never been run by a test.")
    pic_fit(s, chart_path("weight_stack.png"), M, Inches(1.98), Inches(7.5), Inches(3.55))
    rx = M + Inches(7.85)
    rw = W - M - rx
    facts = [("54 of 123", "weight is verified by the executed test suite"),
             ("40 of 123", "weight sits in features with no execution evidence at all"),
             ("14 of 123", "weight is partial; the remaining 15 sits in four not-started items")]
    y = Inches(2.06)
    for val, label in facts:
        rect(s, rx, y, rw, Inches(1.10), fill=PAPER, line=LINE, line_w=0.8)
        tf = txbox(s, rx + Inches(0.24), y + Inches(0.14), rw - Inches(0.48), Inches(0.9))
        para(tf, val, size=19, bold=True, color=NAVY, first=True, space_after=2)
        para(tf, label, size=9.5, color=BODY, space_after=0, line=1.15)
        y += Inches(1.20)
    tf = txbox(s, M, Inches(5.72), CW, Inches(0.75))
    para(tf, "Weights are this audit's user-impact judgement, not project data — no requirements document exists. "
             "The full weighting table is section 23 of the report.", size=10, italic=True, color=MUTED,
         first=True, space_after=0, line=1.2)
    footer(s, num(), "Features")
    notes(s, "Read the chart as a ranking of what would hurt if it broke. Verified weight is 54 of 123, unverified "
             "40, partial 14, not-started 15. The unverified 40 is the entire AI pipeline, and the heaviest single "
             "item in the deck — upload plus background processing at weight 12 — sits in it. That is the arithmetic "
             "behind the gap between the two headline percentages, and it is why the top recommendation is a pipeline "
             "test rather than a feature.")

    # ================================================== 7 PROVEN
    s = blank(prs)
    eyebrow(s, "Evidence")
    title(s, "What demonstrably works",
          "Ten tests executed during this audit in a clean environment: 10 passed, 2 skipped in 1.84 seconds.")
    kpi_card(s, M, Inches(2.06), Inches(2.6), Inches(1.55), "10",
             "tests passed", "2 skipped (need Chromium)", GREEN, value_size=30)
    proven = [
        ("Tenant isolation is proven adversarially.",
         "Every stored vector gets an identical embedding; only the owner_id payload filter separates results."),
        ("Streaming is byte-exact.",
         "206 with correct Content-Range, 416 on unsatisfiable, malformed headers ignored, HEAD supported."),
        ("Sharing is revocable and race-safe.",
         "Six cases cover permissions, revocation, the latest-job gate and concurrent creation."),
        ("Chat follow-ups are verified at the query level.",
         "The test asserts the exact rewritten retrieval string for a context-dependent follow-up."),
    ]
    findings_list(s, proven, top=Inches(3.92), size=11.5, gap=0.70)
    footer(s, num(), "Evidence")
    notes(s, "This is the strongest evidence in the repository and it deserves credit. The isolation test is "
             "the standout: it gives every candidate the same similarity score so that only the payload "
             "filter can produce the right answer — that is testing the security property, not the happy "
             "path. The sharing feature also shipped with concurrency and revocation coverage. Everything "
             "on this slide was run, not read.")

    # ================================================== 8 UNVERIFIED
    s = blank(prs)
    eyebrow(s, "The central risk")
    title(s, "The AI pipeline has never been executed by a test",
          "Five features — the core product claim — rest on code inspection alone. This is risk R1, rated Critical.")
    box_l, box_w = M, Inches(6.4)
    tf = txbox(s, box_l, Inches(2.05), box_w, Inches(0.3))
    para(tf, "IMPLEMENTED, NOT VERIFIED", size=9.5, bold=True, color=BLUE, first=True, space_after=10)
    for i, name in enumerate(["Video upload + background pipeline", "Whisper transcription",
                              "BLIP visual captioning", "URL ingestion via yt-dlp",
                              "Live RTMP ingestion (backend)"]):
        y = Inches(2.42 + 0.55 * i)
        rect(s, box_l, y, box_w, Inches(0.46), fill=PAPER, line=LINE, line_w=0.7)
        tf = txbox(s, box_l + Inches(0.18), y + Inches(0.10), box_w - Inches(0.4), Inches(0.3))
        para(tf, name, size=11.5, color=INK, first=True, space_after=0)
    tf = txbox(s, box_l, Inches(5.45), box_w, Inches(0.9))
    para(tf, "No fixture, no sample media file, no recorded run, no log output. Every test that touches these "
             "paths stubs the worker module out.", size=10.5, italic=True, color=MUTED, first=True,
         space_after=0, line=1.2)

    rx = M + box_w + Inches(0.55)
    rw = W - M - rx
    rect(s, rx, Inches(2.05), rw, Inches(4.25), fill=RGBColor(0xFC, 0xF0, 0xEF), line=RGBColor(0xE8, 0xC9, 0xC6))
    tf = txbox(s, rx + Inches(0.3), Inches(2.28), rw - Inches(0.6), Inches(3.8))
    para(tf, "Why this matters", size=13, bold=True, color=RED, first=True, space_after=9)
    for t in ["A regression anywhere in preprocessing, transcription, captioning or summarisation is "
              "invisible until a user hits it.",
              "The 57% verified figure cannot rise until this changes — it is the single largest lever in "
              "the report.",
              "A broken pipeline makes the tested features worthless: search and chat have nothing to "
              "search.",
              "The fix is small: 10 seconds of ffmpeg-generated media and one test stubbing only the LLM."]:
        para(tf, "—  " + t, size=10.5, color=BODY, space_after=8, line=1.2)
    footer(s, num(), "Risk R1")
    notes(s, "If the audience remembers one slide, it should be this one. The five features listed here are "
             "the reason someone would use ClipSearch at all, and none of them has ever been run by an "
             "automated check. There is no fixture media in the repository, no recorded output, no log. The "
             "remedy is not expensive: generate a ten-second clip with ffmpeg, stub only the language model, "
             "assert the pipeline produces a transcript, a caption, a summary and index points.")

    # ================================================== 9 DELIVERY GAP
    s = blank(prs)
    eyebrow(s, "Delivery")
    title(s, "Nothing runs automatically, and nothing is deployable",
          "The repository contains no .github directory, no Dockerfile, no compose file and no infrastructure definition.")
    items = [
        ("CI/CD", "Absent", "A two-second test suite exists and is never run by a machine."),
        ("Container image", "Absent", "No reproducible build. Dependency resolution is unpinned across machines."),
        ("Migration chain", "Broken", "One stale migration; startup bypasses Alembic with create_all()."),
        ("Observability", "Absent", "Zero logging imports, 40 print() calls, no metrics, no error tracking."),
        ("Backup procedure", "Absent", "All user data lives in one gitignored directory with no copy."),
        ("Rate limiting", "Delegated", "Anonymous inference relies on a proxy that is not in the repository."),
    ]
    cw2 = (CW - Inches(0.3)) / 2
    for i, (label, state, detail) in enumerate(items):
        r_, c_ = divmod(i, 2)
        x = M + c_ * (cw2 + Inches(0.3))
        y = Inches(2.05 + r_ * 1.20)
        rect(s, x, y, cw2, Inches(1.02), fill=WHITE, line=LINE, line_w=0.8)
        tf = txbox(s, x + Inches(0.22), y + Inches(0.16), cw2 - Inches(0.44), Inches(0.80))
        p = para(tf, "", first=True, space_after=2)
        r = p.add_run(); r.text = label + "   "
        r.font.size = Pt(12); r.font.bold = True; r.font.color.rgb = NAVY; r.font.name = FONT
        r = p.add_run(); r.text = state.upper()
        r.font.size = Pt(8.5); r.font.bold = True; r.font.color.rgb = RED; r.font.name = FONT
        para(tf, detail, size=10, color=BODY, space_after=0, line=1.15)
    rect(s, M, Inches(5.72), CW, Inches(0.92), fill=NAVY)
    tf = txbox(s, M + Inches(0.32), Inches(5.92), CW - Inches(0.64), Inches(0.6))
    para(tf, "The only documented way to run this application is a manual uvicorn command from a "
             "developer's virtual environment.", size=12.5, color=WHITE, first=True, space_after=0, line=1.2)
    footer(s, num(), "Delivery")
    notes(s, "Six gaps, all in delivery rather than product. The most indefensible is CI: the test suite "
             "runs in under two seconds and still never runs. The most damaging for a real deployment is the "
             "migration chain — Alembic is configured, alembic.ini is tracked, one migration exists, and it "
             "predates two of the five tables. Startup hides this by calling create_all() at import, which "
             "works on SQLite and would produce a schema that cannot be built on Postgres.")

    # ================================================== 10 SECURITY
    s = blank(prs)
    eyebrow(s, "Security")
    title(s, "Above-average controls, one high-severity gap",
          "No committed secrets. No raw SQL. Ownership enforced at the data layer, not the presentation layer.")
    strengths = [
        "Playback tokens are a separate JWT scope bound to one video, 60-minute expiry, explicitly rejected as session tokens",
        "Every vector query passes owner_id into a payload filter — proven adversarially",
        "Storage paths resolved and rejected unless still under the storage root (traversal blocked)",
        "Public endpoints project a field whitelist: no owner_id, no internal metadata",
        "Public pages served no-referrer, noindex; media served no-store, nosniff, sandboxed CSP",
        "Prompt-injection baseline: excerpt text is framed as quoted content in every LLM prompt",
    ]
    tf = txbox(s, M, Inches(2.02), Inches(6.15), Inches(4.2))
    para(tf, "WHAT IS DONE WELL", size=9.5, bold=True, color=GREEN, first=True, space_after=10)
    for t in strengths:
        para(tf, "—  " + t, size=10.5, color=BODY, space_after=8, line=1.2)

    rx = M + Inches(6.55)
    rw = W - M - rx
    tf = txbox(s, rx, Inches(2.02), rw, Inches(0.3))
    para(tf, "FINDINGS", size=9.5, bold=True, color=RED, first=True, space_after=10)
    finds = [("High", "Anonymous viewer can consume inference; no in-repo rate limiting"),
             ("Medium", "CORS wildcard combined with credentials, shipped enabled"),
             ("Medium", "Uploads fully buffered in memory with no size cap"),
             ("Medium", "No throttling or lockout on login and signup"),
             ("Low", "Share tokens never expire; legacy API-key module still present")]
    y = Inches(2.40)
    for sev, text in finds:
        h = Inches(0.66)
        rect(s, rx, y, rw, h, fill=WHITE, line=LINE, line_w=0.8)
        rect(s, rx, y, Inches(0.05), h, fill=SEV_COLOR[sev])
        tf = txbox(s, rx + Inches(0.18), y + Inches(0.085), rw - Inches(0.36), Inches(0.55))
        para(tf, sev.upper(), size=7.5, bold=True, color=SEV_COLOR[sev], first=True, space_after=2)
        para(tf, text, size=9.5, color=BODY, space_after=0, line=1.1)
        y += h + Inches(0.12)
    footer(s, num(), "Security")
    notes(s, "Credit first: the authentication design is better than most projects at this stage. The "
             "playback-token split solves the problem that a video tag cannot send an Authorization header, "
             "and it closes the obvious hole by rejecting playback tokens as session tokens. The high "
             "finding is not a code defect — it is that the repository delegates real rate limiting to a "
             "proxy that does not exist in it, while the README acknowledges anonymous inference as a cost "
             "risk. Mediums are all configuration-level and cheap to close.")

    # ================================================== 11 GITHUB
    s = blank(prs)
    eyebrow(s, "Repository history")
    title(s, "25 commits, 8 active days, two abandoned redesigns",
          "High-iteration solo development in two bursts, separated by five quiet weeks.")
    stats = [("25", "commits"), ("7", "PRs merged"), ("0", "issues ever"),
             ("0", "releases"), ("2", "authors")]
    x = M
    for val, label in stats:
        tf = txbox(s, x, Inches(2.02), Inches(2.1), Inches(0.75))
        para(tf, val, size=30, bold=True, color=NAVY, first=True, space_after=0)
        para(tf, label, size=10, color=MUTED, space_after=0)
        x += Inches(2.35)
    rule(s, M, Inches(2.92), CW, LINE, 1.0)
    tf = txbox(s, M, Inches(3.05), CW, Inches(0.6))
    para(tf, "Of roughly 19,000 added lines, about 10,100 were later deleted — a revert and a discarded "
             "React/TypeScript frontend.", size=11.5, color=BODY, first=True, space_after=0, line=1.2)
    pic_fit(s, chart_path("timeline.png"), M, Inches(3.68), CW, Inches(2.95))
    footer(s, num(), "History")
    notes(s, "The timeline is the honest version of the commit graph. Initial commit builds the whole "
             "architecture on 6 October. A 4,792-line workspace redesign is merged and reverted the same day. "
             "A 6,373-line React/TypeScript frontend is added on 11 November and deleted within hours. Then "
             "the most productive week: playback hardening, public sharing with tests, context-aware chat. "
             "Historical line counts therefore cannot estimate delivered scope. Note also that every PR was "
             "merged by its own author, one of them forty-two seconds after opening — self-review, so the "
             "absence of automated checks matters more than usual.")

    # ================================================== 12 CONNECTORS
    s = blank(prs)
    eyebrow(s, "Connected sources")
    title(s, "No external project evidence exists",
          "Linear, Figma, Drive and Slides were all queried exhaustively. None contains ClipSearch work.")
    rows = [("Linear", "1 team", "4 issues — all Linear's own onboarding defaults (MAY-1 … MAY-4). Zero projects, zero documents."),
            ("Figma", "1 file", "Untouched starter team library from 2024. Three empty frames, zero components, zero screens."),
            ("Google Drive", "0 files", "No ClipSearch files. No Docs, Sheets or Slides of any kind."),
            ("Google Slides", "0 decks", "No presentation exists."),
            ("GitHub Actions", "0 workflows", "No CI telemetry exists because no CI is configured.")]
    y = Inches(2.05)
    for name, count, detail in rows:
        rect(s, M, y, CW, Inches(0.62), fill=WHITE if count in ("1 team", "1 file") else PAPER,
             line=LINE, line_w=0.8)
        tf = txbox(s, M + Inches(0.22), y + Inches(0.16), Inches(1.6), Inches(0.3))
        para(tf, name, size=11.5, bold=True, color=NAVY, first=True, space_after=0)
        tf = txbox(s, M + Inches(1.95), y + Inches(0.16), Inches(1.5), Inches(0.3))
        para(tf, count, size=11, bold=True, color=MUTED, first=True, space_after=0)
        tf = txbox(s, M + Inches(3.55), y + Inches(0.17), CW - Inches(3.8), Inches(0.4))
        para(tf, detail, size=10, color=BODY, first=True, space_after=0, line=1.1)
        y += Inches(0.70)
    rect(s, M, Inches(5.72), CW, Inches(0.98), fill=RGBColor(0xFD, 0xF6, 0xEC),
         line=RGBColor(0xE8, 0xD3, 0xB0))
    tf = txbox(s, M + Inches(0.3), Inches(5.88), CW - Inches(0.6), Inches(0.7))
    para(tf, "Consequence: there is no requirements document, no backlog and no task completion record to "
             "audit. Every progress figure in this deck is therefore built from discovered functionality, "
             "using disclosed user-impact weights rather than project data.",
         size=11, color=RGBColor(0x6B, 0x4B, 0x18), first=True, space_after=0, line=1.2)
    footer(s, num(), "Sources")
    notes(s, "This slide exists because the audit brief asked for cross-source validation, and the honest "
             "answer is that there is nothing to validate against. The Linear workspace was created one day "
             "after the last commit and holds only the four default onboarding issues. The only Figma file "
             "reachable is a 2024 starter library with a magenta and indigo palette that has no relationship "
             "to the shipped green design. Figma folder listing was denied on the token, so additional files "
             "cannot be ruled out — that limitation is stated in the report.")

    # ================================================== 13 RISK
    s = blank(prs)
    eyebrow(s, "Risk")
    title(s, "Ten risks, two of them blockers",
          "Two are confirmed as currently preventing delivery; the remainder are evidenced concerns that have not yet failed.")
    rect(s, M, Inches(2.02), Inches(3.05), Inches(2.05), fill=RGBColor(0xFC, 0xF0, 0xEF),
         line=RGBColor(0xE8, 0xC9, 0xC6))
    tf = txbox(s, M + Inches(0.26), Inches(2.20), Inches(2.55), Inches(1.7))
    para(tf, "2", size=32, bold=True, color=RED, first=True, space_after=2)
    para(tf, "Critical risks", size=12, bold=True, color=INK, space_after=6)
    para(tf, "R1 — no automated verification of the ML pipeline\nR2 — no CI/CD or deployment automation",
         size=9.5, color=BODY, space_after=0, line=1.2)
    rect(s, M, Inches(4.22), Inches(3.05), Inches(1.75), fill=PAPER, line=LINE)
    tf = txbox(s, M + Inches(0.26), Inches(4.40), Inches(2.55), Inches(1.4))
    para(tf, "Confirmed blockers", size=11.5, bold=True, color=INK, first=True, space_after=6)
    para(tf, "R2 — no deploy artefact of any kind\nR3 — the migration chain cannot build the current schema",
         size=9.5, color=BODY, space_after=0, line=1.2)
    pic_fit(s, chart_path("risk.png"), M + Inches(3.32), Inches(1.98), CW - Inches(3.32), Inches(4.05))
    footer(s, num(), "Risk")
    notes(s, "Distinguish confirmed blockers from potential risks, because the report does. R2 and R3 are "
             "reproduced failures: there is no artefact to deploy, and the migration chain omits two tables. "
             "R1 is not a known-broken pipeline — it is an unverified one, which is why it is Critical. The "
             "remaining eight are configuration, coverage and single-process concerns that become failures "
             "under specific conditions rather than today.")

    # ================================================== 14 READINESS
    s = blank(prs)
    eyebrow(s, "Readiness")
    title(s, "Ready for one developer. Not ready for a launch.",
          "Four gates, each assessed against specific missing artefacts rather than a general impression.")
    y = Inches(2.10)
    for stage, verdict, reason in d.READINESS:
        col = {"YES": GREEN, "CONDITIONAL": AMBER, "NO": RED}[verdict]
        h = Inches(1.06)
        rect(s, M, y, CW, h, fill=WHITE, line=LINE, line_w=0.8)
        tf = txbox(s, M + Inches(0.24), y + Inches(0.20), Inches(3.2), Inches(0.35))
        para(tf, stage, size=12, bold=True, color=NAVY, first=True, space_after=0)
        badge = rect(s, M + Inches(3.55), y + Inches(0.20), Inches(1.35), Inches(0.34), fill=col)
        tf = badge.text_frame
        tf.margin_left = 0; tf.margin_right = 0; tf.margin_top = 0; tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        para(tf, verdict, size=9.5, bold=True, color=WHITE, first=True, space_after=0,
             align=PP_ALIGN.CENTER)
        tf = txbox(s, M + Inches(5.15), y + Inches(0.16), CW - Inches(5.4), Inches(0.8))
        para(tf, reason, size=9.5, color=BODY, first=True, space_after=0, line=1.15)
        y += h + Inches(0.14)
    footer(s, num(), "Readiness")
    notes(s, "The ladder is deliberately concrete. Developer-local passes because one person can run it "
             "today with Python, ffmpeg and Ollama, and the covered tests pass. QA is conditional because a "
             "tester needs a written plan, a CI job and media fixtures before their findings are "
             "reproducible. Staging fails on artefacts; production fails on artefacts plus an unverified "
             "pipeline, unbounded anonymous inference and no backup for the only copy of user data.")

    # ================================================== 15 RECOMMENDATIONS
    s = blank(prs)
    eyebrow(s, "Recommendations")
    title(s, "Three changes in the first week",
          "No new user-facing features. This is the shortest path from 57% verified to a defensible release candidate.")
    recs = [("P0", "Add a CI workflow running pytest on every push",
             "The suite already exists and takes two seconds. Regression blindness ends on day one.", "1 day"),
            ("P0", "Write the missing Alembic migration",
             "users, video_shares, videos.owner_id. Wire env.py to metadata; add alembic to requirements.", "1–2 days"),
            ("P0", "Create one end-to-end pipeline test",
             "ffmpeg-generated 10-second clip, stub only the LLM. Converts R1 from Critical to Closed.", "1 day")]
    y = Inches(2.05)
    for pri, head, detail, est in recs:
        rect(s, M, y, CW, Inches(1.02), fill=WHITE, line=LINE, line_w=0.9)
        rect(s, M, y, Inches(0.055), Inches(1.02), fill=RED)
        tf = txbox(s, M + Inches(0.24), y + Inches(0.17), Inches(0.6), Inches(0.3))
        para(tf, pri, size=12, bold=True, color=RED, first=True, space_after=0)
        tf = txbox(s, M + Inches(0.95), y + Inches(0.15), Inches(6.6), Inches(0.7))
        para(tf, head, size=12.5, bold=True, color=NAVY, first=True, space_after=3)
        para(tf, detail, size=10, color=BODY, space_after=0, line=1.15)
        tf = txbox(s, W - M - Inches(1.35), y + Inches(0.38), Inches(1.1), Inches(0.3),
                   align=PP_ALIGN.RIGHT)
        para(tf, est, size=10, bold=True, color=MUTED, first=True, space_after=0, align=PP_ALIGN.RIGHT)
        y += Inches(1.14)
    tf = txbox(s, M, Inches(5.55), CW, Inches(0.35))
    para(tf, "THEN, IN THE SECOND WEEK", size=9.5, bold=True, color=MUTED, first=True, space_after=0)
    later = ["Containerise (Dockerfile + compose with Ollama)",
             "Drive CORS from config; add a token-bucket limiter",
             "Stream uploads to disk with a size cap",
             "Replace print() with logging; probe dependencies in /health"]
    cw3 = (CW - Inches(0.45)) / 2
    for i, t in enumerate(later):
        r_, c_ = divmod(i, 2)
        x = M + c_ * (cw3 + Inches(0.45))
        tf = txbox(s, x, Inches(5.92 + r_ * 0.44), cw3, Inches(0.4))
        para(tf, "—  " + t, size=10, color=BODY, first=True, space_after=0, line=1.1)
    footer(s, num(), "Recommendations")
    notes(s, "The plan is intentionally narrow. Three P0 items, about four days of work, and the report "
             "estimates they lift verified completion from 57% to roughly 78–85%. The estimate is a range "
             "because it depends on whether the pipeline test passes the first time — and finding out is the "
             "whole point. Note the sequencing: CI first, so everything after it is validated automatically; "
             "then migrations, so a deployment has a schema; then the pipeline test, which is the expensive "
             "one.")

    # ================================================== 16 GAP SUMMARY
    s = blank(prs)
    eyebrow(s, "Gap analysis")
    title(s, "What the documentation promises versus what ships",
          "Two advertised capabilities cannot be reached from the interface, and two setup instructions are incomplete.")
    rows = [("Live RTMP ingestion", "Backend routes present", "UI deleted 18 Nov — unreachable", "Remove or rebuild"),
            ("Speaker diarization", "Code path complete", "Dependencies commented out, never displayed", "Document or drop"),
            ("Alembic migrations", "Configured and tracked", "Chain predates two tables; startup bypasses it", "Repair the chain"),
            ("Setup instructions", "Single pip command", "Does not install alembic or diarization extras", "Split extras"),
            ("Environment contract", "3 settings documented", "8 are read by the code", "Complete .env.example"),
            ("Design alignment", "Tokenised design system", "No Figma design exists to compare", "Not assessable")]
    hdrs = ["Capability", "Documented state", "Shipped reality", "Resolution"]
    xs = [M, M + Inches(2.55), M + Inches(5.45), M + Inches(9.35)]
    ws = [Inches(2.4), Inches(2.8), Inches(3.8), Inches(1.7)]
    rule(s, M, Inches(2.12), CW, NAVY, 1.6)
    for i, h in enumerate(hdrs):
        tf = txbox(s, xs[i], Inches(2.20), ws[i], Inches(0.3))
        para(tf, h.upper(), size=8.5, bold=True, color=MUTED, first=True, space_after=0)
    y = Inches(2.60)
    for label, doc_state, reality, fix in rows:
        tf = txbox(s, xs[0], y, ws[0], Inches(0.36))
        para(tf, label, size=10.5, bold=True, color=INK, first=True, space_after=0)
        tf = txbox(s, xs[1], y, ws[1], Inches(0.4))
        para(tf, doc_state, size=9.5, color=BODY, first=True, space_after=0, line=1.1)
        tf = txbox(s, xs[2], y, ws[2], Inches(0.4))
        para(tf, reality, size=9.5, color=BODY, first=True, space_after=0, line=1.1)
        tf = txbox(s, xs[3], y, ws[3], Inches(0.4))
        para(tf, fix, size=9.5, bold=True, color=AMBER, first=True, space_after=0, line=1.1)
        y += Inches(0.68)
        rule(s, M, y - Inches(0.10), CW, LINE, 0.75)
    footer(s, num(), "Gaps")
    notes(s, "Documentation quality is high where it exists — the README is well written and the frontend "
             "API contract table is precise. But it describes a product slightly ahead of the shipped one. "
             "Live ingestion and diarization are both real in the backend and unreachable in the interface. "
             "Neither is dishonest; both are disclosed in source comments. The practical resolution is a "
             "decision, not a fix: are these in scope? If yes, rebuild the UI; if no, remove the routes so "
             "the surface matches the product.")

    # ================================================== 17 FINAL ASSESSMENT
    s = blank(prs)
    eyebrow(s, "Assessment")
    title(s, "Final verdict")
    rect(s, M, Inches(1.95), CW, Inches(1.55), fill=NAVY)
    tf = txbox(s, M + Inches(0.40), Inches(2.18), CW - Inches(0.8), Inches(1.2))
    para(tf, "A substantial working prototype with one production-grade feature and no production-grade "
             "delivery process. The engineering inside the code is stronger than the engineering around it — "
             "which is the better of the two problems to have.",
         size=15, color=WHITE, first=True, space_after=0, line=1.3)
    pairs = [("Actual status", "Substantial working prototype; post-hackathon quality with one production-grade feature"),
             ("Architecture", "Good — coherent, layered, honestly documented trade-offs"),
             ("Code quality", "Good — readable and defensive; ordinary solo-project debt in dead modules"),
             ("Test coverage", "Weak overall; strong on the sharing contract specifically"),
             ("Security", "Adequate — several above-average controls, one high and three medium findings"),
             ("Operations", "Absent — no artefacts, no observability, no backup"),
             ("Biggest strength", "Security-aware design in authentication, streaming and tenant isolation"),
             ("Biggest weakness", "Nothing verifies the AI pipeline, and nothing runs automatically"),
             ("To a release candidate", "Roughly 3–4 weeks of focused work by one engineer")]
    y = Inches(3.68)
    for k, v in pairs:
        tf = txbox(s, M, y, Inches(2.15), Inches(0.3))
        para(tf, k, size=10, bold=True, color=MUTED, first=True, space_after=0)
        tf = txbox(s, M + Inches(2.25), y, CW - Inches(2.25), Inches(0.3))
        para(tf, v, size=10.5, color=BODY, first=True, space_after=0)
        y += Inches(0.335)
    footer(s, num(), "Verdict")
    notes(s, "Close on the asymmetry. Process can be added in days; a broken architecture takes months to "
             "undo. This project has the good problem. The three-to-four week estimate to a release "
             "candidate is dominated by the pipeline test and deployment scaffolding, and assumes no new "
             "features are added — which is the recommendation.")

    # ================================================== 18 WHAT WOULD CHANGE IT
    s = blank(prs)
    eyebrow(s, "Open questions")
    title(s, "What one day of access would resolve",
          "The largest open question in this report is answerable on any machine with a GPU and Ollama.")
    rect(s, M, Inches(2.02), Inches(6.3), Inches(3.05), fill=RGBColor(0xF3, 0xF7, 0xF4),
         line=RGBColor(0xC9, 0xE0, 0xD3))
    tf = txbox(s, M + Inches(0.32), Inches(2.24), Inches(5.65), Inches(2.6))
    para(tf, "One end-to-end run", size=13.5, bold=True, color=GREEN, first=True, space_after=10)
    para(tf, "Process a single five-minute video on a working host, then inspect the transcript, the "
             "captions, the summary, the chapters and three search results.", size=11, color=BODY,
         space_after=10, line=1.22)
    para(tf, "That one run moves five features out of “unverified” — to either verified or a concrete, "
             "fixable defect — and replaces an estimated band with a measured number.",
         size=11, color=BODY, space_after=0, line=1.22)
    rx = M + Inches(6.65)
    rw = W - M - rx
    tf = txbox(s, rx, Inches(2.02), rw, Inches(0.3))
    para(tf, "QUESTIONS THAT WOULD CHANGE THE REPORT", size=9.5, bold=True, color=MUTED, first=True,
         space_after=8)
    qs = ["Is the target a local single-user tool or a hosted multi-tenant service?",
          "Are live ingestion and diarization in scope, or should they be retired?",
          "Is PostgreSQL the intended production database, or is SQLite permanent?",
          "Does a design exist outside the connected Figma account?",
          "Was any pipeline run ever executed successfully outside a developer machine?"]
    y = Inches(2.42)
    for q in qs:
        rect(s, rx, y, Inches(0.05), Inches(0.36), fill=BLUE)
        tf = txbox(s, rx + Inches(0.2), y, rw - Inches(0.25), Inches(0.62))
        para(tf, q, size=10.5, color=BODY, first=True, space_after=0, line=1.18)
        y += Inches(0.72)
    footer(s, num(), "Open questions")
    notes(s, "End with what is genuinely unknown rather than what is merely incomplete. Two of these "
             "questions materially reorder the recommendations: a local single-user target means rate "
             "limiting and multi-tenancy drop in priority, while a hosted target makes them blocking. The "
             "report makes no assumption about either, and says so.")

    # ================================================== 19 CLOSE
    s = blank(prs)
    rect(s, 0, 0, W, H, fill=NAVY)
    rect(s, 0, 0, Emu(int(0.09 * 914400)), H, fill=GREEN)
    tf = txbox(s, Inches(1.0), Inches(1.95), Inches(11.0), Inches(0.4))
    para(tf, "THE ASK", size=11, bold=True, color=RGBColor(0x8F, 0xC9, 0xB6), first=True, space_after=0)
    tf = txbox(s, Inches(1.0), Inches(2.42), Inches(11.0), Inches(1.7))
    para(tf, "Two weeks of verification and delivery scaffolding,\nbefore any new feature.",
         size=31, bold=True, color=WHITE, first=True, space_after=0, line=1.22)
    rect(s, Inches(1.0), Inches(4.28), Inches(2.0), Emu(int(2.4 * 12700)), fill=GREEN)
    tf = txbox(s, Inches(1.0), Inches(4.68), Inches(10.6), Inches(1.3))
    para(tf, "Achieves: CI running on every push · a schema that can actually be built · the AI pipeline "
             "proven once end to end · verified completion from 57% to roughly 80%.",
         size=13, color=RGBColor(0xAF, 0xC1, 0xCF), first=True, space_after=0, line=1.35)
    tf = txbox(s, Inches(1.0), Inches(6.55), Inches(11.0), Inches(0.3))
    para(tf, "ClipSearch — Project Progress Report · 24 November 2026 · v1.0  ·  full detail in the "
             "companion DOCX, 31 sections, all 69 files", size=9,
         color=RGBColor(0x6F, 0x86, 0x99), first=True, space_after=0)
    notes(s, "The close should be a single ask, not a summary. Two weeks, three deliverables, no new "
             "features. If the audience takes one action, it is authorising the pipeline test, because that "
             "is the item that converts the whole report's central uncertainty into a measurement.")

    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       f"Project_Progress_Executive_Review_{d.PROJECT}_{d.AUDIT_DATE}.pptx")
    prs.save(out)
    return out, n[0]


if __name__ == "__main__":
    print(build())
