import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Captions, Eye, MessageSquareText } from 'lucide-react';
import { askVideoQuestion } from '../lib/api/chat';
import type { ChatSource, VideoStatus } from '../lib/api/types';
import { formatTimestamp } from '../lib/format';
import { ErrorNotice } from './Feedback';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  sources: ChatSource[];
}

function normalizeSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ChatSource[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<ChatSource>;
    const timestamp = Number(raw.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < 0) return [];
    return [{
      timestamp,
      type: typeof raw.type === 'string' ? raw.type : 'source',
      text: typeof raw.text === 'string' ? raw.text : '',
    }];
  });
}

export function VideoAssistant({
  videoId,
  status,
  onSeek,
}: {
  videoId: string;
  status: VideoStatus | null;
  onSeek: (timestamp: number, autoplay?: boolean) => void;
}) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const available = status === 'completed';

  useEffect(() => {
    if (messages.length > 0 || loading) {
      transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'auto' });
    }
  }, [messages.length, loading]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || loading || !available) return;
    const currentId = ++sequence.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setMessages((current) => [...current, { id: currentId, role: 'user', text: cleanQuestion, sources: [] }]);
    setQuestion('');
    setLoading(true);
    setError(null);

    try {
      const response = await askVideoQuestion(videoId, cleanQuestion, controller.signal);
      if (controller.signal.aborted) return;
      const answer = response && typeof response.answer === 'string' ? response.answer : '';
      if (!answer.trim()) throw new Error('The assistant returned an empty response.');
      setMessages((current) => [...current, {
        id: ++sequence.current,
        role: 'assistant',
        text: answer,
        sources: normalizeSources(response.sources),
      }]);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Your question could not be answered. Try again.');
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <aside className="assistant-panel" aria-label="Ask questions about this video">
      <header className="assistant-panel__header">
        <div>
          <h2>Ask this video</h2>
          <p>Answers include the moments they come from.</p>
        </div>
        <MessageSquareText size={17} strokeWidth={1.8} aria-hidden="true" />
      </header>

      {!available && (
        <p className="assistant-notice" role="status">
          {status === 'failed' ? 'Questions are unavailable because processing did not finish.' : 'Questions become available when processing is complete.'}
        </p>
      )}

      <div className="assistant-transcript" ref={transcriptRef} aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && (
          <div className="assistant-empty">
            <span className="assistant-empty__mark"><MessageSquareText size={18} aria-hidden="true" /></span>
            <p>Ask about a topic, a person, or what happens at a particular point.</p>
            <span>Evidence from this video will be shown with the answer.</span>
          </div>
        )}

        {messages.map((message) => (
          <article className={`assistant-message assistant-message--${message.role}`} key={message.id}>
            <div className="assistant-message__label">{message.role === 'user' ? 'You' : 'ClipSearch'}</div>
            <p className="assistant-message__text">{message.text}</p>
            {message.role === 'assistant' && message.sources.length > 0 && (
              <div className="assistant-sources">
                <div className="assistant-sources__heading">Sources</div>
                {message.sources.map((source) => {
                  const isVisual = source.type === 'visual';
                  const SourceIcon = isVisual ? Eye : Captions;
                  const sourceLabel = isVisual ? 'Visual' : source.type === 'speech' ? 'Speech' : 'Source';
                  return (
                    <button
                      className="assistant-source"
                      type="button"
                      key={`${source.timestamp}-${source.type}-${source.text}`}
                      onClick={() => onSeek(source.timestamp, true)}
                      aria-label={`Play ${sourceLabel.toLowerCase()} source at ${formatTimestamp(source.timestamp)}`}
                    >
                      <span className="assistant-source__meta"><SourceIcon size={13} aria-hidden="true" /> {sourceLabel} <time>{formatTimestamp(source.timestamp)}</time></span>
                      {source.text && <span className="assistant-source__text">{source.text}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </article>
        ))}

        {loading && <div className="assistant-loading" role="status"><span className="spinner" aria-hidden="true" /> Searching this video…</div>}
      </div>

      {error && <div className="assistant-error"><ErrorNotice message={error} compact /></div>}

      <form className="assistant-input" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="assistant-question">Ask a question about this video</label>
        <input
          id="assistant-question"
          type="text"
          placeholder={available ? 'Ask a question…' : 'Available after processing'}
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          disabled={!available || loading}
        />
        <button className="assistant-input__send" type="submit" disabled={!question.trim() || !available || loading} aria-label="Send question">
          <ArrowUp size={17} aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
}
