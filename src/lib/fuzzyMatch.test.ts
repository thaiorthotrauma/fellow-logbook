import { describe, expect, it } from 'vitest';
import { fuzzyScore, fuzzyScoreWords } from './fuzzyMatch';

describe('fuzzyScore', () => {
  it('matches an exact substring', () => {
    expect(fuzzyScore('orif', 'Open reduction internal fixation')).not.toBeNull();
  });

  it('matches scattered characters in order', () => {
    expect(fuzzyScore('ordis', 'Open reduction, distal radius')).not.toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyScore('ORIF', 'open reduction internal fixation')).not.toBeNull();
  });

  it('returns null when characters are out of order', () => {
    expect(fuzzyScore('bca', 'abc')).toBeNull();
  });

  it('returns null when a character is missing entirely', () => {
    expect(fuzzyScore('xyz', 'abc')).toBeNull();
  });

  it('empty query matches everything with score 0', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('scores a tighter, word-aligned match higher than a scattered one', () => {
    const tight = fuzzyScore('rad', 'distal radius fracture');
    const scattered = fuzzyScore('rad', 'right ankle deformity');
    expect(tight).not.toBeNull();
    expect(scattered).not.toBeNull();
    expect(tight!).toBeGreaterThan(scattered!);
  });
});

describe('fuzzyScoreWords', () => {
  it('requires every word to match, in any order', () => {
    expect(fuzzyScoreWords('radius distal', 'distal radius fracture')).not.toBeNull();
    expect(fuzzyScoreWords('radius humerus', 'distal radius fracture')).toBeNull();
  });

  it('empty query matches everything with score 0', () => {
    expect(fuzzyScoreWords('   ', 'anything')).toBe(0);
  });
});
