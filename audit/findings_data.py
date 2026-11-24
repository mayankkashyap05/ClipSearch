"""
Authoritative findings dataset for the ClipSearch audit (2026-11-24).

Every number used in the DOCX, PPTX and chat summary is derived from this file
so the three deliverables cannot drift apart. Source references point at the
repository at commit 295f566 (branch arena/25207b2c-clipsearch, base 295f5663).
"""

AUDIT_DATE = "2026-11-24"
REPORT_VERSION = "1.0"
PROJECT = "ClipSearch"
REPO = "https://github.com/mayankkashyap05/ClipSearch"
REPO_SLUG = "mayankkashyap05/ClipSearch"
BRANCH = "arena/25207b2c-clipsearch"
BASE_COMMIT = "295f5663ed5395a9053210688202fa345e709a63"
BASE_SHORT = "295f566"

# ---------------------------------------------------------------- repository
FILE_COUNT = 69
PY_FILES, PY_LOC = 30, 2440          # `git ls-files '*.py' | wc -l`, summed wc -l
JS_FILES, JS_LOC = 15, 2600          # frontend/src + tests/sharing_browser.cjs
CSS_FILES, CSS_LOC = 8, 1637
HTML_FILES, HTML_LOC = 1, 457
DOC_FILES, DOC_LOC = 4, 611           # README.md, frontend/README.md, .env.example, LICENSE(count 1)

TOTAL_TRACKED_LOC = sum([PY_LOC, JS_LOC, CSS_LOC, HTML_LOC, 446, 148, 56])  # +install.bat, alembic.ini, .gitignore

INSPECTED = 69
INSPECTED_LINES_TOTAL = 7786
COVERAGE_PCT = 100.0

TOP_DIRS = [
    ("app/core/", 14, "ML/NLP pipeline stages, LLM client, live ingestion, vector index"),
    ("frontend/styles/", 8, "CSS layers: tokens, base, components, shell, library, workspace, auth, responsive"),
    ("frontend/src/features/videos/", 6, "Library, ingest, player, workspace, workspace-layout, share"),
    ("app/db/", 3, "SQLAlchemy models, engine/session, Alembic migration env"),
    ("app/auth/", 3, "JWT sessions, playback tokens, password hashing, legacy API keys"),
    ("root", 8, "README, LICENSE, requirements, alembic.ini, install.bat, .env.example, .gitignore, .gitattributes"),
    ("frontend/src/components/", 2, "Navigation and toast feedback"),
    ("app/workers/", 2, "Thread-pool background pipeline"),
    ("app/storage/", 2, "Local-disk object storage shim"),
    ("app/api/", 2, "Single FastAPI application module"),
    ("tests/", 2, "Pytest contract suite + optional Playwright script"),
]

# ------------------------------------------------------------------ features
# (name, status, weight, evidence, gap)
FEATURES = [
    ("Email/password authentication (JWT sessions)",
     "Completed & Verified", 8,
     "app/auth/users.py:38-83, app/api/main.py:78-102; signup/login paths exercised by contract tests",
     "No password reset, no email verification, no rate limiting on /auth/*"),
    ("Video upload + background processing pipeline",
     "Implemented, Not Verified", 12,
     "app/api/main.py:105-135, app/workers/tasks.py:109-162, app/core/preprocessing.py",
     "No test ever runs ffmpeg/Whisper/BLIP; upload path is covered only with the worker stubbed out"),
    ("Speech transcription (Whisper)",
     "Implemented, Not Verified", 8,
     "app/core/transcription.py:27-58; model cache + disk cache",
     "No transcription quality/accuracy evidence; model never exercised in CI or locally"),
    ("Visual keyframe captioning (BLIP)",
     "Implemented, Not Verified", 7,
     "app/core/vision.py:26-89, 1 JPEG per 10s via app/core/preprocessing.py:97-123",
     "Caption quality and dedupe on long videos unverified"),
    ("Semantic search (embeddings + cross-encoder rerank)",
     "Completed & Verified", 12,
     "app/core/qdrant_indexing.py:137-244; isolation of owner_id+video_id proven by test_embedded_qdrant_isolates_both_ids",
     "Single shared collection; no index versioning or re-embed migration"),
    ("Video Q&A chat with cited timestamps (RAG)",
     "Completed & Verified", 8,
     "app/core/video_chat.py:80-124, app/api/main.py:374-387, follow-up query rewrite tested",
     "Answer quality depends on local Ollama; no evaluation harness"),
    ("Auto summary + chapter generation",
     "Partially Implemented", 6,
     "app/core/summary.py:74-89 with LLM JSON mode and extractive fallback",
     "Fallback chapters are truncated first-7-words titles; LLM path untested"),
    ("URL ingestion via yt-dlp (+ live progress)",
     "Implemented, Not Verified", 8,
     "app/core/url_download.py:183-240, app/workers/tasks.py:187-224, friendly error mapping",
     "No network download ever executed in test; site-specific breakage untested"),
    ("HTTP Range video streaming + short-lived playback tokens",
     "Completed & Verified", 6,
     "app/api/main.py:197-305, app/auth/users.py:97-136, tests/test_public_sharing.py:154-169",
     "416/206/HEAD behaviour proven; no CDN or throughput test"),
    ("Revocable public share links (public workspace)",
     "Completed & Verified", 10,
     "PR #6, app/api/main.py:537-652, app/db/models.py:51-59, tests/test_public_sharing.py (10 tests)",
     "Revocation cannot claw back already-delivered media; relies on proxy rate limiting"),
    ("Speaker diarization (pyannote)",
     "Partially Implemented", 4,
     "app/core/diarization.py, app/core/merge_speakers.py, gated behind HF_TOKEN in app/workers/tasks.py:121",
     "Dependencies are commented out of requirements.txt; speaker labels never rendered in the UI"),
    ("Live RTMP ingestion (backend)",
     "Implemented, Not Verified", 5,
     "app/core/live_ingest.py, app/core/streaming_transcription.py, app/core/live_sessions.py, 5 /live routes",
     "No frontend surface remains; sessions are in-memory only and lost on restart"),
    ("Live session UI",
     "Not Started", 4,
     "frontend/src/features/live/live.js and styles/live.css were deleted in commit baf4a06; index.html has no live entry point",
     "Backend routes are unreachable from the shipped UI"),
    ("Library management (list, delete, cascade cleanup)",
     "Completed & Verified", 6,
     "app/api/main.py:389-463, delete cascade asserted in test_lifecycle_and_permissions; Qdrant + processed-asset cleanup",
     "No bulk actions or pagination"),
    ("Share link management UI (create/copy/revoke)",
     "Completed & Verified", 4,
     "frontend/src/features/videos/share.js, index.html shareModal, Playwright scenario in tests/sharing_browser.cjs",
     "Playwright script is not wired into any runner"),
    ("Accessibility & responsive layout",
     "Partially Implemented", 4,
     "aria-live regions, roles, tab semantics throughout index.html; responsive.css",
     "No automated a11y audit; keyboard focus order unverified"),
    ("Database schema management (Alembic migrations)",
     "Not Started", 3,
     "Single migration 6ca1c4111120 predates users/video_shares; startup uses Base.metadata.create_all (app/api/main.py:46)",
     "Schema drift between migration and models; alembic not in requirements.txt"),
    ("Automated CI/CD pipeline",
     "Not Started", 4,
     "No .github/ directory; no Dockerfile, no compose file, no deployment config in the repository",
     "Tests only run if a developer invokes pytest manually"),
    ("Deployment & operations hardening",
     "Not Started", 4,
     "README documents a manual uvicorn run; no healthcheck automation, metrics, structured logging (0 `logging` imports, 40 `print`)",
     "No monitoring, no error tracking, no backup automation"),
]
FEATURE_WEIGHTS = sum(f[2] for f in FEATURES)

STATUS_ORDER = ["Completed & Verified", "Implemented, Not Verified",
                "Partially Implemented", "In Development", "Not Started",
                "Blocked", "Needs Investigation"]

PARTIAL_FACTOR = 0.5
IMPL_FACTOR = 0.6   # implemented-but-unverified counts as code-complete, credit partial


def status_counts():
    out = {s: 0 for s in STATUS_ORDER}
    for f in FEATURES:
        out[f[1]] += 1
    return out


def progress():
    """Implementation progress and verified completion progress, weight-based."""
    impl = 0.0
    verified = 0.0
    for _, status, weight, _, _ in FEATURES:
        if status == "Completed & Verified":
            impl += weight
            verified += weight
        elif status == "Implemented, Not Verified":
            impl += weight * 1.0
            verified += weight * 0.35          # code present, behaviour unproven
        elif status == "Partially Implemented":
            impl += weight * PARTIAL_FACTOR
            verified += weight * 0.15
        # Not Started / Blocked contribute nothing
    return {
        "implementation_pct": round(impl / FEATURE_WEIGHTS * 100, 1),
        "verified_pct": round(verified / FEATURE_WEIGHTS * 100, 1),
        "weight_total": FEATURE_WEIGHTS,
    }


# ------------------------------------------------------------------- quality
QUALITY = [
    ("Architecture", "Good", "Clear layering: api / core / workers / db / storage / auth. Single-process thread-pool "
     "pipeline is an explicit, documented trade-off (app/workers/tasks.py:1-8). All ML stages are independently callable."),
    ("Modularity", "Good", "Frontend is split by feature with one transport module (services/api.js) and a single state "
     "object; README documents the contract. Backend modules are single-responsibility."),
    ("Code documentation", "Strong", "Unusually high comment-to-code ratio; several comments record fixed bugs with "
     "rationale (e.g. app/core/streaming_transcription.py:100-105, app/core/vision.py:43-48)."),
    ("Error handling", "Adequate", "User-facing errors are mapped (url_download friendly errors, MediaProcessingError). "
     "But 11 broad `except Exception` blocks and 40 print() calls with zero logging module usage."),
    ("Type safety", "Adequate", "Python type hints on public functions; no mypy/pyright config, no runtime validation "
     "of pipeline payloads. JS is untyped ES modules."),
    ("Test depth", "Weak", "~346 lines of tests, all focused on the sharing contract and one Qdrant isolation test. "
     "Zero coverage of preprocessing, transcription, vision, summarization, upload, or live ingestion."),
    ("Observability", "Weak", "No structured logging, no request IDs, no metrics endpoint, no error tracker."),
    ("Security posture", "Adequate", "JWT + short-lived scoped playback tokens, path-traversal guards in storage keys, "
     "user_id enforced on every Qdrant query, document-level share gating, no-store headers on private media. "
     "CORS is `*` with credentials enabled (app/api/main.py:51-57)."),
    ("Portability", "Adequate", "Local-first by design (embedded Qdrant, SQLite, local disk). Windows installer (-446 "
     "lines batch) is a real investment but untestable here."),
    ("Technical debt", "Moderate", "Dead code: app/auth/api_key.py, app/services/, ApiKey model, "
     "s3_storage.generate_presigned_url/file_exists/ensure_bucket are unused. Stale comments reference Celery/Postgres/S3."),
]

# --------------------------------------------------------------------- risks
RISKS = [
    ("R1", "Critical",
     "No automated verification of the ML pipeline",
     "Transcription, captioning, summarization and URL download have never been executed by any test or CI job. "
     "A regression in any stage is only discoverable by a user uploading a video.",
     "app/workers/tasks.py, app/core/*.py, absence of .github/"),
    ("R2", "Critical",
     "No CI/CD or deployment automation",
     "No .github/, Dockerfile, compose file or infrastructure definition. The only documented run command is a "
     "manual `uvicorn app.api.main:app` on 127.0.0.1. Releases are manual and unreproducible.",
     "repository root, README.md:120-135"),
    ("R3", "High",
     "Database schema drift / no working migration chain",
     "Only one Alembic migration exists and it predates users and video_shares. The app creates tables with "
     "Base.metadata.create_all() at import, so any Postgres deployment via Alembic produces an incomplete schema.",
     "app/db/migrations/versions/6ca1c4111120_initial_tables.py, app/api/main.py:46"),
    ("R4", "High",
     "Uncontrolled public inference surface",
     "Share links allow anonymous search and LLM chat. Mitigations exist (BoundedSemaphore(2), max_length 2048, "
     "limit<=20) but rate limiting is explicitly delegated to an external proxy that is not in the repo.",
     "app/api/main.py:607-645, README.md public-deployment section"),
    ("R5", "High",
     "Single-process, in-memory-state architecture",
     "Embedded Qdrant locks its folder (one process only); live sessions live in a dict; download progress lives "
     "in a dict; wrapper threads are non-durable. Any restart fails all in-flight jobs (fail_interrupted_jobs) and "
     "loses live sessions.",
     "app/core/qdrant_indexing.py:8-9, app/core/live_sessions.py:9, app/workers/tasks.py:90-106"),
    ("R6", "Medium",
     "CORS wildcard with credentials",
     "allow_origins=['*'] together with allow_credentials=True is flagged dev-only in a comment but ships enabled.",
     "app/api/main.py:51-57"),
    ("R7", "Medium",
     "Dependency surface is huge and partly optional",
     "Torch + transformers + Whisper + BLIP + sentence-transformers + pyannote are pulled as pinless/loose ranges; "
     "pyannote and soundfile are commented out while diarization code is imported unconditionally at pipeline load.",
     "requirements.txt, app/workers/tasks.py:26-27"),
    ("R8", "Medium",
     "Zero frontend automated tests",
     "The Playwright scenarios exist as optional scripts requiring CHROMIUM_PATH and ffmpeg; they are skipped by "
     "default and not part of any runner.",
     "tests/sharing_browser.cjs, tests/test_public_sharing.py:256-270"),
    ("R9", "Medium",
     "Upload is fully buffered in memory",
     "`await file.read()` loads the entire upload into RAM before writing to disk; there is no size cap or streaming "
     "write. A large upload can exhaust the single-process memory budget alongside Whisper/BLIP.",
     "app/api/main.py:105-120"),
    ("R10", "Low",
     "Dead modules and stale documentation",
     "API-key auth, services package, ApiKey model and several storage helpers are unused; comments still reference "
     "Celery, Postgres and S3/MinIO that no longer exist.",
     "app/auth/api_key.py, app/services/, app/db/models.py:76-82"),
]

# ------------------------------------------------------------------- history
TIMELINE = [
    ("2026-10-06", "e515d25", "Initial commit — FastAPI backend, ML pipeline, vanilla-JS frontend"),
    ("2026-10-06", "PR #1", "Frontend redesigned and modularised (25 files, +3,794/−2,585)"),
    ("2026-10-07", "PR #2", "'Professional Analysis Studio' workspace redesign (+4,792/−1,018)"),
    ("2026-10-07", "PR #3", "Revert of PR #2 — rework discarded the same day (−4,784 net)"),
    ("2026-11-11", "PR #4", "React/Vite/TS frontend attempt added under frontend-src/ (6,373 added lines, 44 files)"),
    ("2026-11-11", "8ba6c3b", "frontend-src/ deleted again — React attempt abandoned, vanilla JS retained"),
    ("2026-11-11", "PR #5", "README rewritten (positioning, architecture, pipeline, setup)"),
    ("2026-11-18", "b8729c7", "Scripts and 322 lines of tests removed (tests/conftest.py, tests/test_video_stream.py)"),
    ("2026-11-18", "baf4a06", "Live-session frontend and live.css deleted"),
    ("2026-11-19", "84aba34", "Playback recovery + job polling hardening"),
    ("2026-11-20", "PR #6", "Revocable public video workspaces (+987/−135, 26 files, 321 lines of new tests)"),
    ("2026-11-20", "PR #7", "Context-aware Ask follow-ups (+156/−24)"),
]

COMMIT_STATS = {
    "commits": 25,
    "authors": 2,
    "first": "2026-10-06",
    "last": "2026-11-20",
    "span_days": 45,
    "active_days": 8,
    "merged_prs": 7,
    "closed_unmerged_prs": 0,
    "open_prs": 0,
    "issues": 0,
    "releases": 0,
    "tags": 0,
}

# ----------------------------------------------------------------- connectors
CONNECTORS = [
    ("GitHub", "Available", "Repository, full 25-commit history, 7 merged PRs, branches, file tree at 295f566."),
    ("Linear", "Available — no project data",
     "Workspace 'Mayank Kashyap' (team MAY) exists but contains only the 4 default Linear onboarding issues "
     "(MAY-1..MAY-4) and zero projects, zero documents, zero cycles. No ClipSearch work items exist to cross-reference."),
    ("Figma", "Available — no ClipSearch design",
     "The only accessible file is 'Mayank Kashyap's team library' (ZGDle5IgTB2wzeVBZJe1q7), last touched "
     "2024-12-21: a blank starter page with two empty frames (01/02), a color palette (Fuschia/Iris @100/80/60) "
     "and three text styles (Header 1, Header 2, Body). Zero components, zero ClipSearch screens, prototypes or flows. "
     "Folder listing was denied (Invalid scope), so no other Figma file could be enumerated."),
    ("Google Drive / Docs", "Available — no ClipSearch documentation",
     "The connected Drive contains 100+ ML/trading artefacts (BTCUSD model training runs) and zero Google Docs, "
     "Sheets or Slides. Targeted search for 'ClipSearch' and for native Workspace MIME types returned 0 files."),
    ("Google Slides", "Available — empty",
     "No presentations exist in the connected account, so no roadmap or stakeholder deck could be reviewed."),
    ("CI / deployment telemetry", "Unavailable",
     "No CI runs, no build artefacts, no staging or production environment, no logs to inspect."),
]

# --------------------------------------------------------- readiness verdict
READINESS = [
    ("Ready for internal developer testing", "YES",
     "One developer can run it locally end-to-end on a machine with Python 3.10+, ffmpeg and Ollama. The documented "
     "single-process command works; the 10 covered tests pass."),
    ("Ready for QA / structured testing", "CONDITIONAL",
     "Needs a written test plan, a CI job that runs pytest on push, at least one end-to-end media fixture, and a "
     "pinned requirements.lock. Without these, QA findings will not be reproducible."),
    ("Ready for staging", "NO",
     "No container image, no infrastructure definition, no migration chain that builds the current schema, no "
     "observability, and CORS is still wildcard. Staging would have to be hand-built."),
    ("Production-ready", "NO",
     "All staging blockers plus: unverified ML pipeline, anonymous inference surface without in-repo rate limiting, "
     "in-memory state that dies on restart, and no backup/restore procedure for data/."),
]

RECOMMENDATIONS = [
    ("P0", "Add a CI workflow that runs pytest on every push and pull request",
     "No workflow exists today; the suite runs in ~2s and needs no models. Cheapest possible risk reduction.", "1 day"),
    ("P0", "Create an Alembic migration that produces the current schema",
     "Add users and video_shares, autogenerate from models, add alembic to requirements.txt, and make startup "
     "fail loudly on drift instead of silently calling create_all().", "2 days"),
    ("P0", "Write one end-to-end pipeline test with tiny generated media",
     "Use ffmpeg to synthesise a 10-second clip with a spoken tone, stub only the LLM, and assert transcript, "
     "captions, summary, chapters and Qdrant points. This is the single largest blind spot (R1).", "3 days"),
    ("P1", "Containerise the application and document a reproducible deploy",
     "Dockerfile + compose (app + Ollama), .env contract validated at boot, healthcheck on /health.", "2 days"),
    ("P1", "Restrict CORS and finish the public-share hardening story",
     "Configurable allowed origins, in-process token-bucket rate limiting for /shared/*/search and /shared/*/chat, "
     "and a documented proxy configuration.", "2 days"),
    ("P1", "Stream uploads to disk with a configurable size limit",
     "Replace `await file.read()` with chunked writes and reject oversized uploads before processing.", "1 day"),
    ("P2", "Surface the transcript and speaker labels in the workspace",
     "Diarization output exists server-side and is indexed with speaker prefixes but never rendered; a transcript "
     "panel with speaker names closes a visible product gap.", "3 days"),
    ("P2", "Reconnect or retire the live-ingestion feature",
     "Backend /live routes work but have no UI and no persistence. Decide: rebuild the UI, or remove the routes so "
     "the surface matches the product.", "2-3 days"),
    ("P2", "Introduce structured logging and a metrics endpoint",
     "Replace print() with logging, add request IDs and a /metrics or /health/detail endpoint.", "2 days"),
    ("P3", "Remove dead code and reconcile documentation",
     "Delete api_key.py, services/, the ApiKey model and unused storage helpers; update comments referencing Celery, "
     "Postgres and S3.", "1 day"),
    ("P3", "Wire the Playwright scenarios into an optional CI job",
     "The browser scenarios are valuable and already written; make them runnable in a container.", "1 day"),
]

QUESTIONS = [
    ("Is ClipSearch a personal/portfolio project or an intended commercial product?",
     "Nothing in the repository, the Linear workspace, Drive or Figma states a goal, an audience or a deadline. "
     "The roadmap weightings in this report assume a shippable product; for a portfolio project the readiness bar "
     "is materially lower."),
    ("What is the intended deployment target?",
     "README describes a local single-process deployment; the public-share feature and its hardening notes imply a "
     "network-reachable host. These two stories pull in opposite directions and change the priority of R2/R4/R5."),
    ("Is speaker diarization in scope?",
     "Code paths exist and are gated behind HF_TOKEN, but the dependency is not installed by default and the UI "
     "never shows speaker labels."),
    ("Is live RTMP ingestion in scope?",
     "The README advertises it as a headline feature; the UI for it was deleted on 2026-11-18."),
    ("What is the expected maximum upload size and video length?",
     "No limit is enforced and the worker pool is a single thread; this determines whether the current "
     "in-memory upload and 10-second keyframe cadence are viable."),
]

UNVERIFIED = [
    "Transcription accuracy on real audio (Whisper model 'base').",
    "BLIP caption quality and the practical keyframe count for hour-long videos.",
    "LLM summary/chapter quality with llama3.2:1b, including JSON-mode reliability through Ollama.",
    "yt-dlp success rate against current YouTube (site changes frequently break extractors).",
    "Whether the Windows install.bat completes on a clean machine (446 lines, untestable here).",
    "Any Figma design intent for ClipSearch — no such design file is reachable.",
    "Any Linear-tracked scope — no ClipSearch issues, projects or documents exist.",
    "Production behaviour under concurrent users; no load test exists.",
]
