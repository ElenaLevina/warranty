package com.warranty.ocr

import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

/**
 * Фаза 6 — нативный мост Google ML Kit Text Recognition v2 (on-device).
 *
 * СБОРКА ТОЛЬКО НА УСТРОЙСТВЕ/ЭМУЛЯТОРЕ С GOOGLE PLAY SERVICES.
 * JS-сторона: src/services/ocr/ocrService.ts -> MlKitOcrService.
 *
 * Возвращает { candidates: [{ text, confidence }] } — кандидаты по строкам.
 * Выбор номера и форматирование делает чистый TS pickPlate (plateParser).
 *
 * ВНИМАНИЕ (риск R3 из плана): Latin-распознаватель ML Kit часто НЕ отдаёт
 * надёжную per-line confidence (может быть NaN). Если значение недоступно —
 * подставляется FALLBACK_CONFIDENCE. Перед продакшеном согласовать с заказчиком
 * стратегию порога (например, дополнительная проверка по геометрии рамки номера).
 */
class OcrModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  private val recognizer =
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  @ReactMethod
  fun recognize(imagePath: String, promise: Promise) {
    try {
      val file = File(imagePath.removePrefix("file://"))
      if (!file.exists()) {
        promise.reject("ENOENT", "Изображение не найдено: $imagePath")
        return
      }
      val image = InputImage.fromFilePath(reactApplicationContext, Uri.fromFile(file))
      recognizer.process(image)
        .addOnSuccessListener { visionText ->
          val candidates = Arguments.createArray()
          for (block in visionText.textBlocks) {
            for (line in block.lines) {
              val map = Arguments.createMap()
              map.putString("text", line.text)
              val confidence = runCatching { line.confidence.toDouble() }
                .getOrNull()
                ?.takeIf { !it.isNaN() }
                ?: FALLBACK_CONFIDENCE
              map.putDouble("confidence", confidence)
              candidates.pushMap(map)
            }
          }
          val result = Arguments.createMap()
          result.putArray("candidates", candidates)
          promise.resolve(result)
        }
        .addOnFailureListener { e -> promise.reject("OCR_FAILED", e.message, e) }
    } catch (e: Exception) {
      promise.reject("OCR_ERROR", e.message, e)
    }
  }

  companion object {
    const val NAME = "WarrantyOcr"
    private const val FALLBACK_CONFIDENCE = 0.9
  }
}
