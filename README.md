# ClipSearch

ClipSearch turns a video library into searchable knowledge. The React frontend connects to the existing FastAPI API for authentication, uploads, processing status, native video playback, semantic search and video Q&A.

## Frontend development

Start the FastAPI service on port `8000`, then run the Vite app:

```bash
cd frontend-src
npm ci
npm run dev
```

Vite serves the interface on port `5173` and proxies API requests to `http://127.0.0.1:8000`. Set `VITE_API_TARGET` if your API runs elsewhere.

## Production frontend

```bash
cd frontend-src
npm ci
npm run build
```

The build writes static files to the repository's `frontend/` directory. FastAPI serves that directory using its existing `StaticFiles` mount, with explicit SPA entry routes for `/login`, `/signup` and `/app/...` so direct visits and refreshes work. Then run the API as usual, for example:

```bash
uvicorn app.api.main:app --host 0.0.0.0 --port 8000
```

When the API is hosted separately, its URL can be set in **Settings → API connection**. Leaving it blank uses the current site origin.

## Frontend checks

```bash
cd frontend-src
npm test
npm run typecheck
npm run lint
npm run build
```
