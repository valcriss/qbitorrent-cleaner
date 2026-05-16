import { describe, expect, it } from 'vitest';

import {
  canUseProcessTty,
  isConfirmedAnswer,
  shouldAttemptWindowsConsoleFallback
} from '../src/utils/interactive';

describe('interactive confirmation', () => {
  it('accepts only explicit positive answers', () => {
    expect(isConfirmedAnswer('Y')).toBe(true);
    expect(isConfirmedAnswer('yes')).toBe(true);
    expect(isConfirmedAnswer('')).toBe(false);
    expect(isConfirmedAnswer('n')).toBe(false);
    expect(isConfirmedAnswer(undefined)).toBe(false);
  });

  it('detects when the current process TTY can be used directly', () => {
    expect(canUseProcessTty(true, true)).toBe(true);
    expect(canUseProcessTty(true, false)).toBe(false);
  });

  it('enables the Windows console fallback only when needed', () => {
    expect(shouldAttemptWindowsConsoleFallback('win32', false, false)).toBe(true);
    expect(shouldAttemptWindowsConsoleFallback('win32', true, true)).toBe(false);
    expect(shouldAttemptWindowsConsoleFallback('linux', false, false)).toBe(false);
  });
});
