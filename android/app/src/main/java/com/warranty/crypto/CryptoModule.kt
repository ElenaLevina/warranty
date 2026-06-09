package com.warranty.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Фаза 7 — шифрование at-rest на базе Android Keystore (AES-256-GCM).
 *
 * СБОРКА ТОЛЬКО НА УСТРОЙСТВЕ. JS-сторона: src/services/crypto/keystoreCryptoService.ts.
 *
 * Ключ хранится в аппаратном Keystore (не экспортируется из устройства). Формат
 * зашифрованных данных: [12-байтный IV][ciphertext+GCM tag].
 *
 * TODO перед продакшеном:
 *  - openFile() расшифровывает во временный файл cacheDir — добавить очистку после
 *    использования (например, по закрытию экрана-просмотрщика).
 *  - Изоляция по механику (CLAUDE.md §8): добавить per-user алиас ключа или
 *    setUserAuthenticationRequired(true) при наличии биометрии.
 */
class CryptoModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

  private fun getOrCreateKey(): SecretKey {
    (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun encryptBytes(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val iv = cipher.iv // 12 байт для GCM
    val ciphertext = cipher.doFinal(plain)
    return iv + ciphertext
  }

  private fun decryptBytes(data: ByteArray): ByteArray {
    val iv = data.copyOfRange(0, IV_LEN)
    val ciphertext = data.copyOfRange(IV_LEN, data.size)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
    return cipher.doFinal(ciphertext)
  }

  @ReactMethod
  fun encryptText(plain: String, promise: Promise) {
    try {
      val sealed = encryptBytes(plain.toByteArray(Charsets.UTF_8))
      promise.resolve(Base64.encodeToString(sealed, Base64.NO_WRAP))
    } catch (e: Exception) {
      promise.reject("ENCRYPT_TEXT", e.message, e)
    }
  }

  @ReactMethod
  fun decryptText(cipher: String, promise: Promise) {
    try {
      val plain = decryptBytes(Base64.decode(cipher, Base64.NO_WRAP))
      promise.resolve(String(plain, Charsets.UTF_8))
    } catch (e: Exception) {
      promise.reject("DECRYPT_TEXT", e.message, e)
    }
  }

  @ReactMethod
  fun sealFile(srcPath: String, destPath: String, promise: Promise) {
    try {
      val src = File(srcPath.removePrefix("file://"))
      val dest = File(destPath.removePrefix("file://"))
      dest.parentFile?.mkdirs()
      dest.writeBytes(encryptBytes(src.readBytes()))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SEAL_FILE", e.message, e)
    }
  }

  @ReactMethod
  fun openFile(srcPath: String, promise: Promise) {
    try {
      val src = File(srcPath.removePrefix("file://"))
      val out = File(reactApplicationContext.cacheDir, "dec_${System.nanoTime()}")
      out.writeBytes(decryptBytes(src.readBytes()))
      promise.resolve(out.absolutePath)
    } catch (e: Exception) {
      promise.reject("OPEN_FILE", e.message, e)
    }
  }

  /** Delete leftover decrypted temp files (dec_*) from cacheDir. Called on app start. */
  @ReactMethod
  fun clearDecryptedCache(promise: Promise) {
    try {
      reactApplicationContext.cacheDir
        .listFiles { f -> f.name.startsWith("dec_") }
        ?.forEach { it.delete() }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("CLEAR_CACHE", e.message, e)
    }
  }

  companion object {
    const val NAME = "WarrantyCrypto"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "warranty_master_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_LEN = 12
    private const val GCM_TAG_BITS = 128
  }
}
