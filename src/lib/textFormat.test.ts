import { describe, expect, it } from 'vitest';
import { formatClassification, stripBullets } from './textFormat';

describe('stripBullets', () => {
  it('removes leading "- " markers from each line', () => {
    expect(stripBullets('- Anterolateral\n- Posterior')).toBe('Anterolateral\nPosterior');
  });
  it('leaves plain text untouched', () => {
    expect(stripBullets('Anterolateral')).toBe('Anterolateral');
  });
  it('trims surrounding whitespace', () => {
    expect(stripBullets('  - Foo  \n')).toBe('Foo');
  });
});

describe('formatClassification', () => {
  it('only Q6 (AO code) answered → "AO/OTA <code>", no bullet', () => {
    expect(formatClassification('33-A2', '')).toBe('AO/OTA 33-A2');
  });

  it('only Q7 (other) answered → bullets stripped', () => {
    expect(formatClassification('', '- Robin classification type I')).toBe('Robin classification type I');
  });

  it('only Q7 with multiple bulleted lines → all bullets stripped', () => {
    expect(formatClassification('', '- Line one\n- Line two')).toBe('Line one\nLine two');
  });

  it('both answered → bulleted list, AO/OTA first then other\'s lines', () => {
    expect(formatClassification('33-A2', '- Robin classification type I')).toBe(
      '- AO/OTA 33-A2\n- Robin classification type I',
    );
  });

  it('both answered, other has multiple lines without existing bullets → normalizes bullets', () => {
    expect(formatClassification('33-A2', 'Line one\nLine two')).toBe(
      '- AO/OTA 33-A2\n- Line one\n- Line two',
    );
  });

  it('neither answered → empty string', () => {
    expect(formatClassification('', '')).toBe('');
  });

  it('whitespace-only inputs count as unanswered', () => {
    expect(formatClassification('  ', '   \n  ')).toBe('');
  });
});
