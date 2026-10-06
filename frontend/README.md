# ClipSearch frontend

The browser app is dependency-free vanilla JavaScript with native ES modules. FastAPI serves this directory as static files; `index.html` is the entry point.

## Structure

- `src/main.js` wires feature modules and page navigation.
- `src/services/api.js` is the only module that performs `fetch`; endpoint paths, methods, query parameters, payload keys, auth headers, and playback-token URL handling live here.
- `src/state/app-state.js` groups transient state by auth, library, workspace, player, chat, and live-session domain.
- `src/features/` contains cohesive auth, video library/ingest/workspace/player, search, chat, and live workflows.
- `src/components/` contains shared navigation and feedback behavior; `src/utils/format.js` contains pure formatting/sanitization helpers.
- `styles/` separates design tokens, base/components, the app shell, individual product surfaces, and responsive rules.

## Preserved API and browser contracts

| Workflow | Existing contract used by the frontend |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/signup`; JSON `{email, password}`; `clipsearch_token`, `clipsearch_email`, and `clipsearch_api_base` localStorage keys |
| Library and jobs | `GET /videos`; `GET /jobs/{job_id}` |
| File and URL ingestion | `POST /videos` with multipart field `file`; `POST /videos/from-url?url=...` |
| Playback | `GET /videos/{video_id}/playback-token`; `<video>` then consumes the returned `stream_url` directly, preserving its video-bound token and browser Range requests |
| Search and video Q&A | `GET /search?q=...&limit=...` with optional `video_id`; `GET /chat?video_id=...&question=...` |
| Live sessions | `POST /live/start`; `GET /live`; `GET /live/{session_id}/transcript`; `GET /live/{session_id}/search`; `POST /live/{session_id}/stop` |

The live screen uses only those existing `/live` routes and the response fields already returned by the backend. No server code, route, or model is part of this frontend refactor.
