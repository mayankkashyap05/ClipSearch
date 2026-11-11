import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseChapters } from './format';

describe('formatTimestamp', () => {
  it('formats times below and above one hour', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(65.8)).toBe('1:05');
    expect(formatTimestamp(3729)).toBe('1:02:09');
  });

  it('safely handles invalid and negative timestamps', () => {
    expect(formatTimestamp(Number.NaN)).toBe('0:00');
    expect(formatTimestamp(-4)).toBe('0:00');
  });
});

describe('parseChapters', () => {
  it('parses serialized chapters, validates them and sorts by start time', () => {
    expect(parseChapters('[{"start":35,"title":"Closing"},{"start":0,"title":"Opening"},{"start":-2,"title":"Invalid"},{"start":12,"title":" "}]')).toEqual([
      { start: 0, title: 'Opening' },
      { start: 35, title: 'Closing' },
    ]);
  });

  it('accepts arrays and safely returns an empty list for malformed data', () => {
    expect(parseChapters([{ start: 2, title: 'Part one' }, { start: 'bad', title: 'No time' }])).toEqual([
      { start: 2, title: 'Part one' },
    ]);
    expect(parseChapters('{malformed')).toEqual([]);
    expect(parseChapters(null)).toEqual([]);
  });
});
