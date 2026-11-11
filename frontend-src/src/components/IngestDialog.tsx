import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FileVideo2, Link2, UploadCloud, X } from 'lucide-react';
import { importVideoFromUrl, uploadVideo } from '../lib/api/videos';
import type { VideoItem } from '../lib/api/types';
import { formatBytes } from '../lib/format';

const ALLOWED_VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|mkv|webm|avi|ogv|wmv|mpeg|mpg)$/i;

function createdVideo(response: unknown, filename: string): VideoItem {
  if (!response || typeof response !== 'object') throw new Error('The server did not return a video job. Refresh the library before trying again.');
  const data = response as { video_id?: unknown; job_id?: unknown; status?: unknown };
  if (typeof data.video_id !== 'string' || !data.video_id || typeof data.job_id !== 'string' || !data.job_id) {
    throw new Error('The server did not return a video job. Refresh the library before trying again.');
  }
  return {
    video_id: data.video_id,
    filename,
    created_at: null,
    job_id: data.job_id,
    status: typeof data.status === 'string' ? data.status : null,
    current_stage: null,
    summary: null,
  };
}

function validUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function IngestDialog({
  open,
  onClose,
  onCreated,
  initialMode = 'file',
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (video: VideoItem) => void;
  initialMode?: 'file' | 'url';
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'file' | 'url'>(initialMode);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setFile(null);
    setUrl('');
    setError(null);
    setSubmitting(false);
  }, [open, initialMode]);

  function requestClose() {
    if (submitting) return;
    onClose();
  }

  function acceptFile(nextFile: File | undefined) {
    setError(null);
    if (!nextFile) return;
    const videoLike = nextFile.type.startsWith('video/') || ALLOWED_VIDEO_EXTENSIONS.test(nextFile.name);
    if (!videoLike) {
      setFile(null);
      setError('Choose a video file such as MP4, MOV, WebM or MKV.');
      return;
    }
    if (nextFile.size <= 0) {
      setFile(null);
      setError('That file is empty. Choose a different video.');
      return;
    }
    setFile(nextFile);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  async function submitFile() {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await uploadVideo(file);
      onCreated(createdVideo(created, file.name));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The video could not be uploaded. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitUrl() {
    const cleanUrl = url.trim();
    if (submitting) return;
    if (!cleanUrl || !validUrl(cleanUrl)) {
      setError('Enter a valid video URL beginning with http:// or https://.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await importVideoFromUrl(cleanUrl);
      onCreated(createdVideo(created, cleanUrl));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The URL could not be imported. Please check it and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      className="ingest-dialog"
      ref={dialogRef}
      aria-labelledby="ingest-title"
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
    >
      <div className="ingest-dialog__content">
        <div className="dialog-heading">
          <div>
            <h2 id="ingest-title">Add a video</h2>
            <p>Upload a file or import a link to start processing.</p>
          </div>
          <button className="icon-button dialog-heading__close" type="button" onClick={requestClose} aria-label="Close dialog" disabled={submitting}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <fieldset className="segmented-control">
          <legend className="sr-only">How to add a video</legend>
          <button type="button" aria-pressed={mode === 'file'} className={mode === 'file' ? 'is-selected' : ''} onClick={() => { setMode('file'); setError(null); }}>
            <UploadCloud size={15} aria-hidden="true" /> Upload file
          </button>
          <button type="button" aria-pressed={mode === 'url'} className={mode === 'url' ? 'is-selected' : ''} onClick={() => { setMode('url'); setError(null); }}>
            <Link2 size={15} aria-hidden="true" /> Import URL
          </button>
        </fieldset>

        {mode === 'file' ? (
          <div className="ingest-panel">
            {file ? (
              <div className="selected-file">
                <span className="selected-file__icon"><FileVideo2 size={20} aria-hidden="true" /></span>
                <span className="selected-file__details">
                  <span className="selected-file__name" title={file.name}>{file.name}</span>
                  <span className="selected-file__size">{formatBytes(file.size)}</span>
                </span>
                <button type="button" className="icon-button" aria-label="Remove selected file" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} disabled={submitting}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label
                className={`dropzone${dragging ? ' dropzone--active' : ''}`}
                htmlFor="video-file-input"
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <span className="dropzone__icon"><UploadCloud size={20} aria-hidden="true" /></span>
                <span className="dropzone__title">Drag a video here</span>
                <span className="dropzone__copy">or choose a file from your device</span>
                <span className="button button--secondary button--small">Choose video</span>
                <span className="dropzone__formats">MP4, MOV, WebM, MKV and other common video formats</span>
                <input
                  ref={fileInputRef}
                  id="video-file-input"
                  className="dropzone__input"
                  type="file"
                  accept="video/*,.mkv,.avi,.m4v,.ogv,.wmv,.mpeg,.mpg"
                  onChange={(event) => acceptFile(event.currentTarget.files?.[0])}
                  disabled={submitting}
                />
              </label>
            )}
            <button className="button button--primary ingest-submit" type="button" onClick={() => void submitFile()} disabled={!file || submitting}>
              {submitting ? <><span className="spinner spinner--light" aria-hidden="true" /> Uploading…</> : 'Upload video'}
            </button>
          </div>
        ) : (
          <form className="ingest-panel" onSubmit={(event) => { event.preventDefault(); void submitUrl(); }}>
            <label className="field-label" htmlFor="video-url">Video URL</label>
            <div className="input-with-icon">
              <Link2 size={17} aria-hidden="true" />
              <input
                id="video-url"
                type="url"
                inputMode="url"
                placeholder="https://…"
                autoComplete="url"
                value={url}
                onChange={(event) => { setUrl(event.currentTarget.value); setError(null); }}
                disabled={submitting}
                autoFocus={mode === 'url'}
              />
            </div>
            <p className="field-help">Paste a direct link or a supported video-page URL.</p>
            <button className="button button--primary ingest-submit" type="submit" disabled={!url.trim() || submitting}>
              {submitting ? <><span className="spinner spinner--light" aria-hidden="true" /> Importing…</> : 'Import video'}
            </button>
          </form>
        )}

        {error && <p className="form-error ingest-error" role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
