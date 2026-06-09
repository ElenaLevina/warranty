# Израильские номерные знаки — парсинг

## Форматы
- Старый: `XXX-XX-XXX` — 8 цифр, группы 3-2-3.
- Новый:  `XX-XXX-XX` — 7 цифр, группы 2-3-2.

## Алгоритм
1. Из текста ML Kit убрать всё, кроме цифр, по каждому кандидату-строке.
2. По длине цифр определить формат: 8 -> старый, 7 -> новый.
3. Расставить дефисы по шаблону.
4. Несколько кандидатов -> выбрать с максимальной confidence.
5. confidence < 0.85 -> вернуть статус "low_confidence" (пересъёмка/ручной ввод), папку не создавать.

## Референс-реализация (TypeScript, чистая функция)
```ts
export type PlateResult =
  | { ok: true; plate: string; format: 'old' | 'new' }
  | { ok: false; reason: 'not_found' | 'low_confidence' };

const OLD = /^\d{8}$/; // 3-2-3
const NEW = /^\d{7}$/; // 2-3-2

export function formatPlate(digits: string): PlateResult {
  if (OLD.test(digits)) {
    return { ok: true, format: 'old',
      plate: `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}` };
  }
  if (NEW.test(digits)) {
    return { ok: true, format: 'new',
      plate: `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5)}` };
  }
  return { ok: false, reason: 'not_found' };
}

// candidates: распознанные блоки ML Kit с уверенностью
export function pickPlate(
  candidates: { text: string; confidence: number }[],
  threshold = 0.85
): PlateResult {
  const parsed = candidates
    .map(c => ({ res: formatPlate(c.text.replace(/\D/g, '')), confidence: c.confidence }))
    .filter(c => c.res.ok)
    .sort((a, b) => b.confidence - a.confidence);
  if (parsed.length === 0) return { ok: false, reason: 'not_found' };
  const best = parsed[0];
  if (best.confidence < threshold) return { ok: false, reason: 'low_confidence' };
  return best.res;
}
```

## Тест-кейсы (минимум)
- "12345678"      -> 123-45-678 (старый)
- "1234567"       -> 12-345-67 (новый)
- "  123 45 678 " -> 123-45-678 (мусор/пробелы)
- "ABC123"        -> not_found
- кандидат с confidence 0.80 -> low_confidence
- два кандидата 0.90 и 0.95 -> выбран 0.95
