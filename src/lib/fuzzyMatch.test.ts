import { describe, expect, it } from 'vitest';
import { fuzzyScore, fuzzyScoreWordsAcrossFields } from './fuzzyMatch';

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

describe('fuzzyScoreWordsAcrossFields', () => {
  it('requires every word to match some field, in any order', () => {
    expect(fuzzyScoreWordsAcrossFields('radius distal', ['distal radius fracture'])).not.toBeNull();
    expect(fuzzyScoreWordsAcrossFields('radius humerus', ['distal radius fracture'])).toBeNull();
  });

  it('empty query matches everything with score 0', () => {
    expect(fuzzyScoreWordsAcrossFields('   ', ['anything'])).toBe(0);
  });

  it('lets a word match within one field via scattered characters', () => {
    expect(fuzzyScoreWordsAcrossFields('ordis', ['Open reduction, distal radius'])).not.toBeNull();
  });

  it('lets different words be satisfied by different fields', () => {
    expect(fuzzyScoreWordsAcrossFields('volar radius', ['Distal radius fracture', 'Volar'])).not.toBeNull();
  });

  it('does not stitch one word across multiple unrelated fields', () => {
    // "pelvis" letters (p-e-l-v-i-s) happen to appear in order if these
    // fields are concatenated, but no single field contains them — this is
    // the exact false-positive a distal-radius case used to produce for a
    // "pelvis" search when fields were joined into one haystack.
    const fields = [
      'Distal radius fracture',
      '',
      'Volar',
      'Open reduction internal fixation with volar locking plate',
      '2R3B',
      'Radius/Ulna, distal segment',
    ];
    expect(fuzzyScoreWordsAcrossFields('pelvis', fields)).toBeNull();
  });
});
