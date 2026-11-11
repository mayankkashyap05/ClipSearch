import { ArrowUpRight, Captions, Eye, MessageSquareText } from 'lucide-react';
import type { SearchHit } from '../lib/api/types';
import { formatTimestamp, videoDisplayName } from '../lib/format';
import type { VideoItem } from '../lib/api/types';

export function SearchResult({
  hit,
  video,
  onOpen,
}: {
  hit: SearchHit;
  video?: VideoItem;
  onOpen: () => void;
}) {
  const isVisual = hit.type === 'visual';
  const SourceIcon = isVisual ? Eye : hit.type === 'speech' ? Captions : MessageSquareText;
  const sourceName = hit.type === 'visual' ? 'Visual' : hit.type === 'speech' ? 'Speech' : hit.type || 'Source';
  const name = videoDisplayName(video, hit.video_id);
  const timestamp = formatTimestamp(Number(hit.timestamp));

  return (
    <button
      className="search-result"
      onClick={onOpen}
      aria-label={`Open ${name} at ${timestamp}`}
      type="button"
    >
      <span className="search-result__body">
        <span className="search-result__text">{typeof hit.text === 'string' && hit.text.trim() ? hit.text : 'No excerpt text available.'}</span>
        <span className="search-result__meta">
          <span className="search-result__source"><SourceIcon size={13} aria-hidden="true" />{sourceName}</span>
          <span className="search-result__separator" aria-hidden="true">·</span>
          <span className="search-result__video" title={name}>{name}</span>
        </span>
      </span>
      <span className="search-result__jump">
        <span>{timestamp}</span>
        <ArrowUpRight size={15} aria-hidden="true" />
      </span>
    </button>
  );
}
