import { describe, expect, it } from 'vitest';
import { matchScore, matchScoreWordsAcrossFields } from './fuzzyMatch';

describe('matchScore', () => {
  it('matches a substring', () => {
    expect(matchScore('radius', 'Forearm (Radius / Ulna)')).not.toBeNull();
  });

  it('is case-insensitive', () => {
    expect(matchScore('ORIF', 'orif with volar plate')).not.toBeNull();
  });

  it('matches an acronym of the field words', () => {
    expect(matchScore('orif', 'Open reduction internal fixation')).not.toBeNull();
  });

  it('does not match scattered characters', () => {
    // The bug this replaced: every letter of "radius" appears in order here,
    // spread across unrelated words, so subsequence matching returned a hit.
    expect(matchScore('radius', 'Closed fracture lateral malleolus with deltoid ligament injury, right ankle, unstable')).toBeNull();
    expect(matchScore('radius', 'Closed comminuted intertrochanteric fracture right hip, displaced, unstable')).toBeNull();
    expect(matchScore('radius', 'Closed fracture right tibial plateau (Schatzker VI), depressed articular surface')).toBeNull();
  });

  it('returns null when the query is absent', () => {
    expect(matchScore('humerus', 'distal radius fracture')).toBeNull();
  });

  it('matches the same term with a different ending', () => {
    expect(matchScore('pelvis', 'Pelvic ring')).not.toBeNull();
    expect(matchScore('radius', 'Radial head fracture')).not.toBeNull();
    expect(matchScore('tibia', 'Tibial plateau')).not.toBeNull();
    expect(matchScore('malleolus', 'Malleolar fracture')).not.toBeNull();
  });

  it('does not treat a merely similar-looking longer word as the same term', () => {
    expect(matchScore('radius', 'radiographic union')).toBeNull();
    expect(matchScore('distal', 'distraction osteogenesis')).toBeNull();
  });

  it('empty query matches everything with score 0', () => {
    expect(matchScore('', 'anything')).toBe(0);
  });

  it('ranks whole word above word start, above mid-word, above stem, above acronym', () => {
    const whole = matchScore('radius', 'distal radius fracture');
    const wordStart = matchScore('radi', 'distal radius fracture');
    const midWord = matchScore('adius', 'distal radius fracture');
    const stem = matchScore('radial', 'distal radius fracture');
    const acronym = matchScore('drf', 'distal radius fracture');
    expect(whole!).toBeGreaterThan(wordStart!);
    expect(wordStart!).toBeGreaterThan(midWord!);
    expect(midWord!).toBeGreaterThan(stem!);
    expect(stem!).toBeGreaterThan(acronym!);
  });
});

describe('matchScoreWordsAcrossFields', () => {
  const lateralMalleolus = [
    'Closed fracture lateral malleolus with deltoid ligament injury, right ankle, unstable',
    '',
    'Lateral',
    'Open reduction internal fixation with one-third tubular plate and screws',
    '44-B2',
    'Malleolus (Ankle)',
  ];
  const distalRadius = [
    'Cfx DER',
    '',
    'Volar',
    'Open reduction internal fixation with volar locking plate',
    '2R3',
    'Forearm (Radius / Ulna)',
  ];

  const pelvicRing = [
    'Pelvic ring injury, APC type II',
    '',
    'Anterior',
    'Open reduction internal fixation with symphyseal plate',
    '61-B1',
    'Pelvic ring',
  ];

  it('does not match an unrelated region', () => {
    expect(matchScoreWordsAcrossFields('radius', lateralMalleolus)).toBeNull();
  });

  it('finds a pelvic ring case when searching the noun "pelvis"', () => {
    expect(matchScoreWordsAcrossFields('pelvis', pelvicRing)).not.toBeNull();
    expect(matchScoreWordsAcrossFields('pelvis', lateralMalleolus)).toBeNull();
    expect(matchScoreWordsAcrossFields('pelvis', distalRadius)).toBeNull();
  });

  it('matches a distal radius case via its AO region label', () => {
    expect(matchScoreWordsAcrossFields('radius', distalRadius)).not.toBeNull();
  });

  it('requires every word to match some field, in any order', () => {
    expect(matchScoreWordsAcrossFields('radius volar', distalRadius)).not.toBeNull();
    expect(matchScoreWordsAcrossFields('radius humerus', distalRadius)).toBeNull();
  });

  it('does not stitch one word across multiple fields', () => {
    // "volar" spans the approach and procedure fields only when joined.
    expect(matchScoreWordsAcrossFields('volarplate', distalRadius)).toBeNull();
  });

  it('empty query matches everything with score 0', () => {
    expect(matchScoreWordsAcrossFields('   ', ['anything'])).toBe(0);
  });
});
