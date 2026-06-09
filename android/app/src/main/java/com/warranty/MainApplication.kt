package com.warranty

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.warranty.crypto.CryptoPackage
import com.warranty.ocr.OcrPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Warranty: нативные модули, добавляемые вручную (не автолинкуются).
          add(OcrPackage()) // Фаза 6 — ML Kit OCR
          add(CryptoPackage()) // Фаза 7 — Keystore шифрование
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
