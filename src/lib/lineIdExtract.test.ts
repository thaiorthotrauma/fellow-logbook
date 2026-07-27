import { describe, expect, it } from 'vitest';
import { extractLineUserId } from './lineIdExtract';

const FORWARDED_MESSAGE = `💬 Message from unregistered user
No fellow record for this LINE account

LINE user ID
Ud7b3f66b43705f50c2a8cdd268f0587b

[sent a sticker]`;

describe('extractLineUserId', () => {
  it('extracts the id from the full forwarded "unregistered user" message', () => {
    expect(extractLineUserId(FORWARDED_MESSAGE)).toBe('Ud7b3f66b43705f50c2a8cdd268f0587b');
  });

  it('falls back to a bare LINE-shaped id when the label is missing', () => {
    expect(extractLineUserId('just paste this: Ud7b3f66b43705f50c2a8cdd268f0587b, thanks')).toBe(
      'Ud7b3f66b43705f50c2a8cdd268f0587b',
    );
  });

  it('extracts the id even when pasted alone with no surrounding text', () => {
    expect(extractLineUserId('Ud7b3f66b43705f50c2a8cdd268f0587b')).toBe('Ud7b3f66b43705f50c2a8cdd268f0587b');
  });

  it('returns null when nothing LINE-id-shaped is present', () => {
    expect(extractLineUserId('hello there, no id here')).toBeNull();
    expect(extractLineUserId('')).toBeNull();
  });

  it('prefers the labelled line over a coincidental bare match elsewhere', () => {
    const text = `some noise U0000000000000000000000000000000\nLINE user ID\nUd7b3f66b43705f50c2a8cdd268f0587b`;
    expect(extractLineUserId(text)).toBe('Ud7b3f66b43705f50c2a8cdd268f0587b');
  });
});
