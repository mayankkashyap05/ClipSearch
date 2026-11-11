# ClipSearch

**Make every video searchable.**

ClipSearch is a self-hosted video intelligence app. Upload a video or import a supported URL, then search what was said or shown, jump to the relevant moments, and ask questions grounded in the video’s transcript and visual details.

## Features

- Create an account and manage a private video library.
- Upload videos or import URLs supported by `yt-dlp`.
- Transcribe speech, caption sampled frames, and generate summaries and chapters.
- Search spoken and visual content with timestamps and native video playback.
- Ask questions about a video and review the source moments behind the answers.
- Use local defaults for the database, file storage, and vector search—no separate database or Qdrant server required.

## Requirements

- Python 3.10 or newer
- FFmpeg available on your `PATH`
- Node.js 20 or newer (only needed to develop or rebuild the frontend)

Video models download their weights the first time they are used. Initial processing may take a while and can use significant memory.

## Quick start

```bash
git clone https://github.com/mayankkashyap05/ClipSearch.git
cd ClipSearch

python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Install FFmpeg using your operating system’s package manager, then start the API:

```bash
uvicorn app.api.main:app --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The interactive API documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

The production frontend is included in `frontend/`. To rebuild it after frontend changes:

```bash
cd frontend-src
npm ci
npm run build
```

The build updates `frontend/`, which FastAPI serves automatically.

## Local AI (optional)

ClipSearch uses local models for transcription and visual captions. For AI-generated summaries and conversational answers, run [Ollama](https://ollama.com) and download the default model:

```bash
ollama pull llama3.2:3b
```

The default connection is configured in `.env.example`. You can change `LLM_BASE_URL` and `LLM_MODEL` to use another compatible endpoint. Without an LLM, summaries use a basic fallback; search results and source excerpts remain available.

## Frontend development

With the API running on port `8000`:

```bash
cd frontend-src
npm ci
npm run dev
```

Vite starts at [http://localhost:5173](http://localhost:5173) and proxies API requests to `http://127.0.0.1:8000`. Set `VITE_API_TARGET` to use a different API URL.

Run the frontend checks from `frontend-src/`:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Run backend tests from the repository root with `python -m pytest -q`.

## Data and security

By default, ClipSearch stores its SQLite database, videos, and embedded Qdrant index under `data/`. Keep this directory backed up if you need to preserve your library. The API uses a single process with the default embedded Qdrant setup.

Before exposing ClipSearch beyond a trusted local environment, replace the sample `JWT_SECRET` in `.env` with a strong, unique value and review the API’s CORS and deployment settings.

## License

ClipSearch is released under the [MIT License](LICENSE).
