/**
 * OcrService — граница распознавания текста. Возвращает сырые кандидаты;
 * выбор номера делает чистый pickPlate (plateParser), что держит границу тонкой
 * и тестируемой. Реальный ML Kit мост — Фаза 6 (на устройстве).
 */
import { NativeModules } from 'react-native';
import type { OcrResult } from '../../types';

export interface OcrService {
  /** Распознать текст на изображении (путь к JPEG-снимку номера). */
  recognize(imagePath: string): Promise<OcrResult>;
}

/** Контракт нативного модуля WarrantyOcr (android/.../ocr/OcrModule.kt). */
interface WarrantyOcrNative {
  recognize(imagePath: string): Promise<OcrResult>;
}

type MockScript = OcrResult | ((imagePath: string) => OcrResult);

/**
 * MockOcrService — детерминированный провайдер для эмулятора и тестов.
 * Конфигурируется фиксированным результатом или функцией от пути.
 */
export class MockOcrService implements OcrService {
  constructor(private readonly script: MockScript) {}

  async recognize(imagePath: string): Promise<OcrResult> {
    const result = typeof this.script === 'function' ? this.script(imagePath) : this.script;
    return result;
  }
}

/**
 * Реальный мост ML Kit (Фаза 6). Работает только в сборке на устройстве, где
 * зарегистрирован нативный модуль WarrantyOcr. На эмуляторе без Google Play
 * Services / в Node-тестах модуль отсутствует — бросаем понятную ошибку.
 */
export class MlKitOcrService implements OcrService {
  private readonly native = (NativeModules as { WarrantyOcr?: WarrantyOcrNative }).WarrantyOcr;

  async recognize(imagePath: string): Promise<OcrResult> {
    if (this.native === undefined) {
      throw new Error(
        'Нативный модуль WarrantyOcr недоступен. Соберите приложение на устройстве (Фаза 6).',
      );
    }
    return this.native.recognize(imagePath);
  }
}
