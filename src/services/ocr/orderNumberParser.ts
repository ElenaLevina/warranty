/**
 * Order-number parser: extracts the 6-digit repair-order number (הזמנת תיקון)
 * from an OCR scan of the work-order form. Pure TS, device-independent.
 *
 * Form facts (from real service-center forms):
 *  - The order number is ALWAYS 6 digits.
 *  - It is printed twice on a full form: a large display copy at the top and
 *    inline in the order line. A partial photo may contain only one of them.
 *  - The display copy is ALWAYS followed by some symbol and then a tilde
 *    (e.g. "113188=~", "113306x~") — a unique signature no other number
 *    on the form has (odometer, phones, customer id, ת.ז).
 *  - ML Kit does not read Hebrew, so anchoring to the "הזמנת תיקון" label is
 *    impossible; digits + the tilde signature + layout are all we have.
 *
 * Selection cascade:
 *  1. A candidate with the tilde signature wins outright.
 *  2. Otherwise: a single distinct 6-digit value in the frame wins.
 *  3. Otherwise: strictly more occurrences wins (full form repeats the number);
 *     then a clearly larger bounding box (display copy is huge).
 *  4. Still tied -> 'ambiguous': the UI asks to re-shoot just the number.
 * The confidence threshold applies to the winner like for plates.
 */
import type { OcrCandidate, OrderNumberResult } from '../../types';
import { APP_CONFIG } from '../../config';

const ORDER_LEN = 6;
/** Tilde as OCR may render it. */
const TILDES = ['~', '∼', '˜', '⁓'];
/** Max junk characters between the digits and the tilde ("=~", "x~", "~"). */
const MAX_GAP = 2;
/** How much larger the best box must be to win a size tie-break. */
const SIZE_DOMINANCE = 1.5;

/** Exact 6-digit runs in a text (digit-bounded, so phones/ids don't leak). */
function sixDigitRuns(text: string): Array<{ value: string; end: number }> {
  const runs: Array<{ value: string; end: number }> = [];
  const re = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === ORDER_LEN) {
      runs.push({ value: m[0], end: m.index + m[0].length });
    }
  }
  return runs;
}

/** True when a tilde follows the run within MAX_GAP non-digit characters. */
function hasTildeSignature(text: string, runEnd: number): boolean {
  const tail = text.slice(runEnd, runEnd + MAX_GAP + 1);
  for (let i = 0; i < tail.length; i++) {
    const ch = tail[i]!;
    if (/\d/.test(ch)) {
      return false; // digits resumed: not our signature
    }
    if (TILDES.includes(ch)) {
      return true;
    }
  }
  return false;
}

interface ValueStats {
  value: string;
  occurrences: number;
  maxArea: number;
  maxConfidence: number;
  anchored: boolean;
}

export function pickOrderNumber(
  candidates: readonly OcrCandidate[],
  threshold: number = APP_CONFIG.ocrConfidenceThreshold,
): OrderNumberResult {
  const stats = new Map<string, ValueStats>();

  for (const c of candidates) {
    for (const run of sixDigitRuns(c.text)) {
      const s = stats.get(run.value) ?? {
        value: run.value,
        occurrences: 0,
        maxArea: 0,
        maxConfidence: 0,
        anchored: false,
      };
      s.occurrences += 1;
      s.maxArea = Math.max(s.maxArea, c.boxArea ?? 0);
      s.maxConfidence = Math.max(s.maxConfidence, c.confidence);
      s.anchored = s.anchored || hasTildeSignature(c.text, run.end);
      stats.set(run.value, s);
    }
  }

  const values = [...stats.values()];
  if (values.length === 0) {
    return { ok: false, reason: 'not_found' };
  }

  const accept = (s: ValueStats): OrderNumberResult =>
    s.maxConfidence < threshold
      ? { ok: false, reason: 'low_confidence' }
      : { ok: true, orderNumber: s.value };

  // 1. Tilde signature is unique to the order number.
  const anchored = values.filter(s => s.anchored);
  if (anchored.length === 1) {
    return accept(anchored[0]!);
  }
  if (anchored.length > 1) {
    return { ok: false, reason: 'ambiguous' }; // two signatures: bad scan
  }

  // 2. A single distinct value (typical for a close-up fragment).
  if (values.length === 1) {
    return accept(values[0]!);
  }

  // 3. Strictly more occurrences (the full form prints the number twice).
  values.sort((a, b) => b.occurrences - a.occurrences);
  if (values[0]!.occurrences > values[1]!.occurrences) {
    return accept(values[0]!);
  }

  // 4. A clearly larger box (the display copy dwarfs odometer-sized fields).
  const bySize = [...values].sort((a, b) => b.maxArea - a.maxArea);
  if (bySize[0]!.maxArea > 0 && bySize[0]!.maxArea >= SIZE_DOMINANCE * bySize[1]!.maxArea) {
    return accept(bySize[0]!);
  }

  return { ok: false, reason: 'ambiguous' };
}
