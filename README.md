# 🎬 ClipSearch

**Find the moment. Keep the context.**

ClipSearch is a powerful, locally-hosted video library and search engine. It automatically processes uploaded videos or live streams, extracting transcripts and visual context, to create a fully searchable archive. Using local AI models for transcription, vision, and semantic search, ClipSearch allows you to chat with your videos, auto-generate summaries, and pinpoint the exact moments you are looking for.

## ✨ Features

* **🧠 Semantic Video Search:** Find exact moments using natural language. ClipSearch indexes both **speech** (what was said) and **visuals** (what was shown on screen).
* **💬 Chat with Videos:** Ask questions about a specific recording, and the local AI will answer using cited timestamps.
* **🔴 Live Session Ingestion:** Connect an RTMP stream (or any FFmpeg-readable source) to get real-time rolling transcripts and instant search.
* **📝 Auto-Summarization & Chapters:** Automatically generates video overviews and chapters to help you navigate long recordings.
* **🔗 URL Ingestion:** Easily download and index videos directly from URLs (powered by `yt-dlp`).
* **🔒 Privacy-First & Local:** Uses embedded Qdrant for vector storage and local LLMs (via Ollama) to keep your data private and on-device.
* **⚡ Zero-Build Frontend:** A snappy, dependency-free Vanilla JS frontend running natively in the browser.

---

## 🏗️ Architecture & Tech Stack

**Backend**

* **Framework:** FastAPI (Python)
* **Database:** SQLite (default) / PostgreSQL via SQLAlchemy
* **Vector Store:** Embedded Qdrant (Local)

**AI & ML Pipeline**

* **Audio Transcription:** `openai-whisper`
* **Visual Captioning:** `Salesforce/blip-image-captioning-base`
* **Speaker Diarization:** `pyannote/speaker-diarization-3.1` (Optional)
* **Embeddings & Search:** `BAAI/bge-small-en-v1.5` & `cross-encoder/ms-marco-MiniLM-L-6-v2`
* **LLM (Chat & Summary):** Ollama (`llama3.2:3b` by default)

**Frontend**

* **Stack:** Vanilla JavaScript (ES Modules), HTML5, CSS3
* **No Build Step:** Served directly as static files by FastAPI.

---

## ⚙️ Prerequisites

Before you begin, ensure you have the following installed:

1. **Python 3.10+**
2. **[FFmpeg](https://ffmpeg.org/download.html)** (Required for audio extraction, keyframing, and live stream chunking). Must be accessible in your system's `PATH`.
3. **[Ollama](https://ollama.com/)** (Required for video summarization and Q&A chat).

---

## 🚀 Installation & Setup

**1. Clone the repository and navigate to the directory:**

```bash
git clone https://github.com/yourusername/ClipSearch.git
cd ClipSearch

```

**2. Set up a Python Virtual Environment:**

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

```

**3. Install Dependencies:**

```bash
pip install -r requirements.txt

```

*(Optional)* If you want Speaker Diarization (identifying "who spoke when"), install the extra audio libraries:

```bash
pip install pyannote.audio soundfile

```

**4. Set up Environment Variables:**
Copy the example environment file and configure it.

```bash
cp .env.example .env

```

*Note: If using `pyannote` for diarization, you must add a valid `HF_TOKEN` (Hugging Face) to your `.env` file with access to the gated pyannote models.*

**5. Pull the Local LLM:**
Make sure Ollama is running, then pull the default model for summaries and chat:

```bash
ollama pull llama3.2:3b

```

---

## 🏃‍♂️ Running the Application

Because ClipSearch uses an embedded Qdrant database that locks its storage folder, you **must run the application using a single worker process** (do not use `--reload` or multi-workers).

Start the server:

```bash
uvicorn app.api.main:app --host 127.0.0.1 --port 8000

```

Once running, access the web interface at:
👉 **[http://127.0.0.1:8000/](http://127.0.0.1:8000/)**

---

## 🧩 How the Pipeline Works

When a video is uploaded or fetched via URL, ClipSearch runs a background thread pipeline (`app/workers/tasks.py`) through the following stages:

1. **Preprocessing:** FFmpeg extracts 16kHz mono audio (`audio.wav`) and visual keyframes (every 10 seconds).
2. **Transcription:** Whisper transcribes the audio into timestamped text segments.
3. **Diarization (Optional):** Pyannote assigns speaker labels to the audio timeline and merges them with the Whisper transcript.
4. **Captioning:** BLIP generates concrete, searchable text descriptions for every visual keyframe.
5. **Summarization:** The local LLM reads the combined transcript + visual timeline to output a JSON summary and chapter markers.
6. **Indexing:** All speech and visual chunks are embedded via SentenceTransformers and saved to the local embedded Qdrant vector database.

---

## 📁 Project Structure

```text
ClipSearch/
├── app/
│   ├── api/             # FastAPI routes and endpoints
│   ├── auth/            # JWT authentication and API keys
│   ├── core/            # The heavy lifting: ML pipeline, LLM, Live Ingest
│   ├── db/              # SQLAlchemy models, SQLite setup, Alembic migrations
│   ├── storage/         # Local file system storage manager (S3-compatible API)
│   └── workers/         # ThreadPool background job processing
├── frontend/
│   ├── src/             # Vanilla JS features (auth, player, search, live)
│   ├── styles/          # CSS divided by components, shell, and responsive
│   └── index.html       # Main Single Page Application entry point
├── data/                # Auto-generated runtime data (DB, Videos, Qdrant, Temp)
├── requirements.txt     # Python dependencies
└── .env                 # Environment variables

```

---

## 🛡️ License

This project is licensed under the MIT License. See the `LICENSE` file for details.