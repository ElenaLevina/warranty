import { digitsOnly, formatPlate, pickPlate } from './plateParser';
import type { OcrCandidate } from '../../types';

describe('digitsOnly', () => {
  it('strips non-digit characters', () => {
    expect(digitsOnly('  123 45 678 ')).toBe('12345678');
    expect(digitsOnly('123-45-678')).toBe('12345678');
    expect(digitsOnly("מס' 12-345-67")).toBe('1234567');
    expect(digitsOnly('ABC')).toBe('');
  });
});

describe('formatPlate', () => {
  it('formats the old 8-digit format (3-2-3)', () => {
    expect(formatPlate('12345678')).toEqual({
      ok: true,
      format: 'old',
      plate: '123-45-678',
    });
  });

  it('formats the new 7-digit format (2-3-2)', () => {
    expect(formatPlate('1234567')).toEqual({
      ok: true,
      format: 'new',
      plate: '12-345-67',
    });
  });

  it('rejects wrong lengths', () => {
    expect(formatPlate('123456')).toEqual({ ok: false, reason: 'not_found' }); // 6
    expect(formatPlate('123456789')).toEqual({ ok: false, reason: 'not_found' }); // 9
    expect(formatPlate('')).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('pickPlate', () => {
  const cand = (text: string, confidence: number): OcrCandidate => ({ text, confidence });

  it('parses spec test cases', () => {
    expect(pickPlate([cand('12345678', 0.99)])).toEqual({
      ok: true,
      format: 'old',
      plate: '123-45-678',
    });
    expect(pickPlate([cand('1234567', 0.99)])).toEqual({
      ok: true,
      format: 'new',
      plate: '12-345-67',
    });
    expect(pickPlate([cand('  123 45 678 ', 0.99)])).toEqual({
      ok: true,
      format: 'old',
      plate: '123-45-678',
    });
  });

  it('accepts already-formatted input', () => {
    expect(pickPlate([cand('123-45-678', 0.95)])).toMatchObject({
      ok: true,
      plate: '123-45-678',
    });
  });

  it('returns not_found for non-plate text', () => {
    expect(pickPlate([cand('ABC123', 0.99)])).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('returns not_found for empty candidate list', () => {
    expect(pickPlate([])).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns low_confidence when best valid candidate is below threshold', () => {
    expect(pickPlate([cand('12345678', 0.8)])).toEqual({
      ok: false,
      reason: 'low_confidence',
    });
  });

  it('accepts exactly at the 0.85 threshold (inclusive)', () => {
    expect(pickPlate([cand('12345678', 0.85)])).toMatchObject({ ok: true });
  });

  it('picks the highest-confidence valid candidate', () => {
    const res = pickPlate([cand('12345678', 0.9), cand('87654321', 0.95)]);
    expect(res).toEqual({ ok: true, format: 'old', plate: '876-54-321' });
  });

  it('ignores invalid candidates and keeps a valid one above threshold', () => {
    const res = pickPlate([cand('garbage 999', 0.99), cand('1234567', 0.9)]);
    expect(res).toEqual({ ok: true, format: 'new', plate: '12-345-67' });
  });

  it('reports low_confidence when the only valid candidate is below threshold even if junk has high confidence', () => {
    const res = pickPlate([cand('ABCDEF', 0.99), cand('12345678', 0.5)]);
    expect(res).toEqual({ ok: false, reason: 'low_confidence' });
  });

  it('respects a custom threshold', () => {
    expect(pickPlate([cand('12345678', 0.7)], 0.6)).toMatchObject({ ok: true });
  });
});
