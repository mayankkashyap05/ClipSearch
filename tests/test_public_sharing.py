"""Sharing contract tests. Use a populated temporary SQLite DB; no model downloads."""
import importlib.util
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import sessionmaker

from app import config
from app.db import database
from app.db.models import Base, JobStatus, ProcessingJob, User, Video, VideoShare
from app.storage import s3_storage


@pytest.fixture
def site(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path}/app.db", connect_args={"check_same_thread": False})
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    sessions = sessionmaker(engine)
    old_tables = [t for t in Base.metadata.sorted_tables if t is not VideoShare.__table__]
    Base.metadata.create_all(engine, tables=old_tables)
    with sessions.begin() as db:
        db.add_all([User(id=name, email=f"{name}@example.org", hashed_password="unused") for name in ("owner", "viewer")])
        db.add(Video(id="movie", owner_id="owner", filename="Lecture", storage_key="lecture.mp4"))
        db.add(ProcessingJob(id="job", video_id="movie", status=JobStatus.COMPLETED, summary="A lecture",
                             chapters_json='[{"start": 0, "title": "Intro"}]'))
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", sessions)
    monkeypatch.setattr(config, "PROCESSED_DIR", tmp_path)
    monkeypatch.setattr(s3_storage, "STORAGE_DIR", tmp_path)
    monkeypatch.setenv("JWT_SECRET", "test-only-secret-for-signing-session-tokens")
    (tmp_path / "lecture.mp4").write_bytes(b"0123456789")

    def stand_in(module, names):
        stub = ModuleType(module)
        for name in names.split():
            setattr(stub, name, Mock(name=name))
        monkeypatch.setitem(sys.modules, module, stub)
        return stub

    stand_in("app.workers.tasks", "process_video_task process_video_from_url_task get_download_progress fail_interrupted_jobs").get_download_progress.return_value = None
    stand_in("app.core.live_sessions", "start_session get_session stop_session list_sessions")
    stand_in("app.core.url_download", "validate_video_url VideoDownloadError")
    stand_in("app.core.qdrant_indexing", "search")
    stand_in("app.core.video_chat", "ask_about_video")
    # Load the real routes (including their normal create_all) without caching a test app singleton.
    spec = importlib.util.spec_from_file_location("sharing_test_api", config.BASE_DIR / "app/api/main.py")
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    assert set(inspect(engine).get_table_names()) == {t.name for t in old_tables} | {"video_shares"}
    with TestClient(api.app) as client:
        yield SimpleNamespace(client=client, db=sessions, api=api,
                              owner={"Authorization": "Bearer " + api.create_access_token("owner")},
                              viewer={"Authorization": "Bearer " + api.create_access_token("viewer")})
    engine.dispose()


OWNER_PATH = "/videos/movie/share"


def publish(site):
    response = site.client.post(OWNER_PATH, headers=site.owner)
    assert response.status_code == 200
    return response.json()["share_token"]


def unavailable(client, token):
    path = f"/shared/{token}"
    for method, suffix in [("GET", ""), ("GET", "/stream"), ("HEAD", "/stream"),
                           ("GET", "/search?q=x"), ("GET", "/chat?question=x")]:
        assert client.request(method, path + suffix).status_code == 404


def test_lifecycle_and_permissions(site):
    c = site.client
    for method in ("POST", "DELETE"):
        assert c.request(method, OWNER_PATH).status_code == 401
        assert c.request(method, OWNER_PATH, headers=site.viewer).status_code == 404
    token = publish(site)
    assert publish(site) == token
    assert c.get("/jobs/job", headers=site.owner).json()["share_token"] == token
    assert c.get("/videos", headers=site.owner).json()["videos"][0]["share_token"] == token
    assert c.get("/videos", headers=site.viewer).json()["videos"] == []
    assert c.delete(f"/shared/{token}").status_code == 405
    assert c.delete("/videos/movie", headers={"Authorization": "Bearer " + token}).status_code == 401
    assert c.delete("/videos/movie", headers=site.viewer).status_code == 404
    assert c.delete(OWNER_PATH, headers=site.owner).status_code == 200
    unavailable(c, token)
    assert c.get("/jobs/job", headers=site.owner).json()["share_token"] is None
    new = publish(site)
    assert new != token
    unavailable(c, token)
    assert c.delete("/videos/movie", headers=site.owner).status_code == 200
    unavailable(c, new)
    with site.db() as db:
        assert db.query(VideoShare).count() == 0


@pytest.mark.parametrize("status", [JobStatus.PENDING, JobStatus.PROCESSING, JobStatus.FAILED])
def test_latest_job_is_the_gate(site, status):
    token = publish(site)
    with site.db.begin() as db:
        db.add(ProcessingJob(video_id="movie", status=status))
    assert site.client.post(OWNER_PATH, headers=site.owner).status_code == 409
    unavailable(site.client, token)
    site.api.qdrant_search.assert_not_called()
    site.api.ask_about_video.assert_not_called()


def test_missing_media_key_or_unknown_token(site):
    token = publish(site)
    with site.db.begin() as db:
        db.get(Video, "movie").storage_key = "pending"
    unavailable(site.client, token)
    unavailable(site.client, "unknown")


def test_public_projections_queries_and_routes(site):
    c = site.client
    token = publish(site)
    path = f"/shared/{token}"
    response = c.get(path)
    assert response.headers["cache-control"] == "private, no-store"
    data = response.json()
    assert set(data) == {"video_id", "filename", "created_at", "status", "summary", "chapters", "content_type", "stream_url"}
    assert data["status"] == "completed" and data["stream_url"] == path + "/stream"
    site.api.qdrant_search.return_value = [{"video_id": "movie", "owner_id": "owner", "text": "hello", "timestamp": 5}]
    scope = {"video_id": "other", "owner_id": "viewer"}
    result = c.get(path + "/search", params={"q": "lecture", **scope}, headers=site.viewer).json()
    site.api.qdrant_search.assert_called_once_with("lecture", n_results=8, video_id="movie", owner_id="owner")
    assert result["results"] == [{"video_id": "movie", "text": "hello", "timestamp": 5}]
    site.api.ask_about_video.return_value = {"answer": "Hello", "sources": []}
    assert c.get(path + "/chat", params={"question": "What?", **scope}).json() == site.api.ask_about_video.return_value
    site.api.ask_about_video.assert_called_once_with("What?", "movie", "owner")
    for url in [f"/share/{token}", f"/share/{token}/", "/share/revoked"]:
        assert '/src/main.js?v=3' in c.get(url).text
    assert c.get("/no-such-page").status_code == 404
    assert c.get("/src/main.js?v=3").status_code == 200


def test_public_media(site):
    path = f"/shared/{publish(site)}/stream"
    c = site.client
    assert c.get(path).content == b"0123456789"
    head = c.head(path)
    assert head.content == b"" and head.headers["content-length"] == "10"
    for method in ("GET", "HEAD"):
        r = c.request(method, path, headers={"Range": "bytes=2-4"})
        assert r.status_code == 206 and r.headers["content-range"] == "bytes 2-4/10"
        assert r.content == (b"234" if method == "GET" else b"")
        assert r.headers["content-type"] == "video/mp4" and r.headers["accept-ranges"] == "bytes"
        assert r.headers["cache-control"] == "private, no-store"
        assert r.headers["x-content-type-options"] == "nosniff"
    r = c.get(path, headers={"Range": "bytes=12-"})
    assert r.status_code == 416 and r.headers["content-range"] == "bytes */10"
    assert c.get(path, headers={"Range": "bytes=-2"}).content == b"89"


def test_concurrent_publish(site):
    from concurrent.futures import ThreadPoolExecutor
    for _ in range(2):  # exercise first creation and reactivation
        with ThreadPoolExecutor(max_workers=4) as threads:
            tokens = list(threads.map(lambda _: publish(site), range(4)))
        assert len(set(tokens)) == 1
        assert site.client.delete(OWNER_PATH, headers=site.owner).status_code == 200


def test_database_cascade_and_safe_nonmedia(site, tmp_path):
    token = publish(site)
    with site.db.begin() as db:
        db.get(Video, "movie").storage_key = "attachment.html"
    (tmp_path / "attachment.html").write_text("<p>Not media</p>")
    r = site.client.get(f"/shared/{token}/stream")
    assert r.headers["content-type"] == "application/octet-stream"
    assert "sandbox" in r.headers["content-security-policy"]
    with site.db.begin() as db:
        db.query(ProcessingJob).delete()
        db.query(Video).delete()  # bypass ORM cascades; exercise the actual FK
        assert db.query(VideoShare).count() == 0


def test_public_inference_limits(site):
    path = f"/shared/{publish(site)}"
    assert site.client.get(path + "/search?q=x&limit=1000").status_code == 422
    with site.api._public_inference(), site.api._public_inference():
        assert site.client.get(path + "/chat?question=x").status_code == 429
        assert site.client.get(path + "/search?q=x").status_code == 429
        assert site.client.head(path + "/stream").status_code == 200


def test_embedded_qdrant_isolates_both_ids(site, tmp_path, monkeypatch):
    pytest.importorskip("qdrant_client")
    import numpy as np

    def load_core(name):
        spec = importlib.util.spec_from_file_location(name, config.BASE_DIR / f"app/core/{name}.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    # Make all vectors equally relevant. Only the production payload filters
    # can keep private points out of the response and the LLM's context.
    monkeypatch.setitem(sys.modules, "sentence_transformers", SimpleNamespace(SentenceTransformer=Mock, CrossEncoder=Mock))
    index = load_core("qdrant_indexing")
    index.QDRANT_URL, index.QDRANT_PATH = None, tmp_path / "vectors"
    index._embedder = SimpleNamespace(encode=lambda texts: np.ones((len(texts), index.EMBEDDING_DIM)))
    index._reranker = SimpleNamespace(predict=lambda pairs: np.ones(len(pairs)))
    monkeypatch.setitem(sys.modules, "app.core.qdrant_indexing", index)
    chat = load_core("video_chat")
    chat.chat = Mock(return_value="A public moment")
    site.api.qdrant_search, site.api.ask_about_video = index.search, chat.ask_about_video
    try:
        for video, owner, text in [("movie", "owner", "public moment"), ("movie", "viewer", "private account"),
                                   ("another", "owner", "private recording")]:
            index.index_video([{"start": 3, "text": text}], [], video, owner)
        path = f"/shared/{publish(site)}"
        results = site.client.get(path + "/search?q=anything").json()["results"]
        assert [r["text"] for r in results] == ["public moment"]
        assert "owner_id" not in results[0]
        answer = site.client.get(path + "/chat?question=anything").json()
        assert answer["sources"] == [{"timestamp": 3, "type": "speech", "text": "public moment"}]
        prompt = chat.chat.call_args.args[0][-1]["content"]
        assert "public moment" in prompt and "private" not in prompt
    finally:
        index._get_client().close()


def test_live_browser_share_and_revoke(site, tmp_path):
    """Optional real HTTP/browser check: set CHROMIUM_PATH, install playwright, put ffmpeg on PATH."""
    import os
    import shutil
    import socket
    import subprocess
    import threading

    import uvicorn

    chromium = os.environ.get("CHROMIUM_PATH")
    ffmpeg = shutil.which("ffmpeg")
    if not chromium or not ffmpeg:
        pytest.skip("Live browser test needs CHROMIUM_PATH and ffmpeg")
    playwright = pytest.importorskip("playwright.sync_api")
    subprocess.run([ffmpeg, "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc2=size=160x90:rate=10", "-t", "8", "-c:v", "libvpx",
                    str(tmp_path / "lecture.webm")], check=True, timeout=20)
    with site.db.begin() as db:
        db.get(Video, "movie").storage_key = "lecture.webm"
        db.get(ProcessingJob, "job").chapters_json = '[{"start": 3, "title": "Chapter two"}]'
    # Only inference is substituted on this user journey. Browser requests are not intercepted.
    site.api.qdrant_search.return_value = [{"video_id": "movie", "owner_id": "owner", "type": "speech",
                                            "timestamp": 2, "text": "A relevant moment"}]
    site.api.ask_about_video.return_value = {"answer": "See the introduction.",
                                            "sources": [{"type": "speech", "timestamp": 1, "text": "Intro"}]}
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen()
        origin = f"http://127.0.0.1:{sock.getsockname()[1]}"
        server = uvicorn.Server(uvicorn.Config(site.api.app, log_level="error", access_log=False))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
        thread.start()
        try:
            with playwright.sync_playwright() as pw:
                browser = pw.chromium.launch(executable_path=chromium)
                owner = browser.new_page()
                viewer = browser.new_page()  # separate storage/cookie jar
                for page, auth in [(owner, site.owner), (viewer, site.viewer)]:
                    page.set_default_timeout(10000)
                    jwt = auth["Authorization"].removeprefix("Bearer ")
                    page.goto(origin + "/health")
                    page.evaluate("jwt => localStorage.setItem('clipsearch_token', jwt)", jwt)
                owner.goto(origin)
                owner.locator('[data-share-video="movie"]').click()
                owner.locator('#openShare[href]').wait_for()
                url = owner.locator('#shareUrl').input_value()
                assert url.startswith(origin + '/share/')
                requests, errors = [], []
                viewer.on("request", lambda req: requests.append((req.url, req.headers)))
                viewer.on("pageerror", lambda error: errors.append(str(error)))
                viewer.goto(url)
                viewer.locator('#playerShell[data-state="ready"]').wait_for()
                assert viewer.locator('video').evaluate('v => v.videoWidth') == 160
                assert not viewer.locator('#workspaceDeleteBtn').is_visible()

                def check_jump(selector, timestamp):
                    viewer.locator(selector).click()
                    viewer.wait_for_function('''t => { const v = document.querySelector('video');
                        return !v.paused && v.currentTime >= t && v.currentTime < t + 1; }''', arg=timestamp)

                check_jump('[data-chapter-start]', 3)
                viewer.locator('#searchInput').fill('moment')
                viewer.locator('#searchInput').press('Enter')
                check_jump('.result-item', 2)
                viewer.locator('#railTabAsk').click()
                viewer.locator('.suggestion-chip').first.click()
                check_jump('.chat-source', 1)
                stream = url.replace('/share/', '/shared/') + '/stream'
                r = viewer.request.get(stream, headers={"Range": "bytes=4-7"})
                assert r.status == 206 and len(r.body()) == 4
                assert r.headers['content-range'].startswith('bytes 4-7/')

                owner.locator('#revokeShare').click()
                owner.locator('#shareModal').wait_for(state='hidden')
                viewer.locator('#railTabSearch').click()
                viewer.locator('#searchInput').press('Enter')  # already-open tab, no reload
                viewer.locator('#sharedErrorView').wait_for()
                assert viewer.request.head(stream).status == 404
                viewer.reload()
                viewer.locator('#sharedErrorView').wait_for()
                assert viewer.evaluate("localStorage.getItem('clipsearch_token')") == site.viewer['Authorization'][7:]
                assert all(not headers.get('authorization') for _, headers in requests)
                allowed = tuple(origin + prefix for prefix in ('/share/', '/shared/', '/src/', '/styles/', '/favicon.ico'))
                assert all(request_url.startswith(allowed) for request_url, _ in requests)
                assert errors == []
                browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            assert not thread.is_alive()
