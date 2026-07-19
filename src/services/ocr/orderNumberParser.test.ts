import { pickOrderNumber } from './orderNumberParser';
import type { OcrCandidate } from '../../types';

function c(text: string, confidence = 0.95, boxArea?: number): OcrCandidate {
  return { text, confidence, ...(boxArea !== undefined ? { boxArea } : {}) };
}

describe('pickOrderNumber — tilde signature (display copy)', () => {
  it('picks the number from "113188=~" (real form 1)', () => {
    const res = pickOrderNumber([
      c('113188=~', 0.9, 5000),
      c('398-58-803', 0.95, 900), // plate
      c('046570829', 0.9), // phone
      c('149053', 0.92, 400), // odometer (6 digits!)
      c('143267', 0.9, 400), // previous odometer
      c('113188', 0.93, 600), // inline order line
    ]);
    expect(res).toEqual({ ok: true, orderNumber: '113188' });
  });

  it('picks the number from "113306x~" (real form 2)', () => {
    const res = pickOrderNumber([
      c('113306x~', 0.91, 5200),
      c('208861161', 0.9), // ת.ז (9 digits)
      c('13466', 0.9), // odometer (5 digits here)
      c('113306', 0.94, 620),
    ]);
    expect(res).toEqual({ ok: true, orderNumber: '113306' });
  });

  it('accepts a bare tilde with a lost middle symbol ("113306~")', () => {
    const res = pickOrderNumber([c('113306~', 0.9, 5000), c('149053', 0.95, 5000)]);
    expect(res).toEqual({ ok: true, orderNumber: '113306' });
  });

  it('does not treat digits after the run as a signature ("1131881~")', () => {
    // 7-digit run is not an order number at all.
    const res = pickOrderNumber([c('1131881~', 0.9)]);
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('pickOrderNumber — fragments without the display copy', () => {
  it('single 6-digit value in a close-up wins', () => {
    const res = pickOrderNumber([c('113188', 0.9, 800), c('06-587935', 0.9)]);
    expect(res).toEqual({ ok: true, orderNumber: '113188' });
  });

  it('repetition wins on a full form without a readable tilde', () => {
    const res = pickOrderNumber([
      c('113188', 0.9, 5000),
      c('113188', 0.9, 600),
      c('149053', 0.95, 600), // odometer, once
    ]);
    expect(res).toEqual({ ok: true, orderNumber: '113188' });
  });

  it('clearly larger box wins a repetition tie', () => {
    const res = pickOrderNumber([
      c('113188', 0.9, 5000), // huge display copy
      c('149053', 0.95, 600), // odometer
    ]);
    expect(res).toEqual({ ok: true, orderNumber: '113188' });
  });

  it('same-size competitors -> ambiguous (ask to re-shoot the number)', () => {
    const res = pickOrderNumber([
      c('113188', 0.9, 600), // order line
      c('149053', 0.9, 620), // odometer right next to it, same font
    ]);
    expect(res).toEqual({ ok: false, reason: 'ambiguous' });
  });
});

describe('pickOrderNumber — guards', () => {
  it('never extracts 6-digit substrings from longer numbers', () => {
    // Phone 046570829 and ת.ז 512611252 contain 6-digit substrings.
    const res = pickOrderNumber([c('046570829', 0.99), c('512611252', 0.99)]);
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects a winner below the confidence threshold', () => {
    const res = pickOrderNumber([c('113188=~', 0.5, 5000)]);
    expect(res).toEqual({ ok: false, reason: 'low_confidence' });
  });

  it('two tilde signatures -> ambiguous (bad scan)', () => {
    const res = pickOrderNumber([c('113188=~', 0.9), c('220044x~', 0.9)]);
    expect(res).toEqual({ ok: false, reason: 'ambiguous' });
  });

  it('empty input -> not_found', () => {
    expect(pickOrderNumber([])).toEqual({ ok: false, reason: 'not_found' });
  });

  it('handles the number inside a longer OCR line ("=113188~ 113188")', () => {
    // OCR may merge the display copy and the inline value into one line.
    const res = pickOrderNumber([c('הזמנת 113188=~ 113188', 0.9, 3000)]);
    expect(res).toEqual({ ok: true, orderNumber: '113188' });
  });
});
