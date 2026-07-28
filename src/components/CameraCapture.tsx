/**
 * CameraCapture — полноэкранная реальная камера на react-native-vision-camera.
 * Используется на устройстве при FEATURES.realCamera. Поддерживает фото и видео.
 *
 * Требования ТЗ §6:
 *  - фото: вспышка авто, высокое разрешение (≥8 МП по возможности формата);
 *  - видео: ≥1080p, автостоп по достижении лимита (по умолчанию 180 c) + предупреждение.
 *
 * НЕ рендерится в Node-тестах/эмуляторе (там dev-путь). Проверять на телефоне.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  AppState,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { APP_CONFIG } from '../config';

export type CaptureMode = 'photo' | 'video';

interface Props {
  /** Initial capture mode. */
  mode: CaptureMode;
  /** Показать рамку-подсказку пропорций номера (для первого фото). */
  showPlateFrame?: boolean;
  /** Show a Фото/Видео toggle and let the user switch mode without leaving. */
  allowModeSwitch?: boolean;
  /** Small banner with what's already captured (e.g. "3 фото, 1 видео"). */
  counterText?: string;
  onPhoto?: (path: string) => void;
  onVideo?: (path: string, durationSec: number) => void;
  /** Persistent mode: show a "Готово" button to finish capturing. */
  onDone?: () => void;
  onCancel: () => void;
}

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Photo flash mode; cycled by the flash button (auto -> on -> off). */
type FlashMode = 'auto' | 'on' | 'off';
const FLASH_ORDER: FlashMode[] = ['auto', 'on', 'off'];

export function CameraCapture({
  mode,
  showPlateFrame = false,
  allowModeSwitch = false,
  counterText,
  onPhoto,
  onVideo,
  onDone,
  onCancel,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const mic = useMicrophonePermission();
  const camera = useRef<Camera>(null);

  // Keep the camera session tied to real visibility. When the screen turns off
  // (or the app backgrounds), Android tears down the camera; if isActive stayed
  // hard-coded true, vision-camera would not rebuild the preview surface on
  // resume and the user saw a black screen (only fixed by toggling video/photo).
  // Driving isActive from AppState + navigation focus rebuilds it automatically.
  const isFocused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);
  const cameraActive = isFocused && foreground;

  const [currentMode, setCurrentMode] = useState<CaptureMode>(mode);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // §6 capture controls: photo flash, video torch (LED lamp), and digital zoom.
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(1);

  // Pinch-to-zoom (two fingers, like the stock gallery/camera): continuous, to
  // whatever level the user wants. zoomStart snapshots the zoom at gesture begin;
  // each update scales it and clamps to the lens' range.
  const zoomStart = useRef(1);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          zoomStart.current = zoom;
        })
        .onUpdate(e => {
          const min = device?.minZoom ?? 1;
          const max = device?.maxZoom ?? 1;
          const next = Math.min(Math.max(zoomStart.current * e.scale, min), max);
          setZoom(next);
        })
        .runOnJS(true),
    [zoom, device],
  );
  const zoomFactor = device !== undefined ? zoom / device.neutralZoom : 1;

  // Start at the lens' neutral zoom once the device is known.
  useEffect(() => {
    if (device !== undefined) {
      setZoom(device.neutralZoom);
    }
  }, [device]);

  // Запросить разрешения при монтировании (микрофон — если видео возможно).
  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(() => undefined);
    }
    if ((mode === 'video' || allowModeSwitch) && !mic.hasPermission) {
      mic.requestPermission().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Format per mode: photo uses the full-resolution (native 4:3) format so the
  // aspect ratio matches the phone's stock camera; video targets 1080p. Mixing
  // both constraints made vision-camera pick a wide cropped format (e.g.
  // 4080x1884), which is why app photos looked unusually wide.
  const format = useCameraFormat(
    device,
    currentMode === 'video'
      ? [{ videoResolution: { width: 1920, height: 1080 } }, { fps: 30 }]
      : [{ photoResolution: 'max' }],
  );

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const takePhoto = async (): Promise<void> => {
    if (camera.current === null || busy) {
      return;
    }
    setBusy(true);
    try {
      const photo = await camera.current.takePhoto({ flash });
      onPhoto?.(photo.path);
    } catch (e) {
      Alert.alert(t('camera.shootErrorTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stopVideo = useCallback(async (): Promise<void> => {
    if (!recording || camera.current === null) {
      return;
    }
    clearTimer();
    try {
      await camera.current.stopRecording();
    } catch {
      // финал придёт в onRecordingFinished/onRecordingError
    }
  }, [recording, clearTimer]);

  const startVideo = (): void => {
    if (camera.current === null || recording) {
      return;
    }
    setElapsed(0);
    setRecording(true);
    camera.current.startRecording({
      flash: 'off',
      onRecordingFinished: video => {
        setRecording(false);
        clearTimer();
        onVideo?.(video.path, Math.round(video.duration));
      },
      onRecordingError: error => {
        setRecording(false);
        clearTimer();
        Alert.alert(t('camera.recordErrorTitle'), error.message);
      },
    });
    // Тикаем секунды и автостоп по лимиту.
    timer.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= APP_CONFIG.maxVideoDurationSec) {
          Alert.alert(t('camera.videoLimitTitle'), t('camera.videoLimitMsg'));
          stopVideo().catch(() => undefined);
        }
        return next;
      });
    }, 1000);
  };

  const cycleFlash = (): void => {
    setFlash(prev => FLASH_ORDER[(FLASH_ORDER.indexOf(prev) + 1) % FLASH_ORDER.length]!);
  };
  const flashLabel: Record<FlashMode, string> = {
    auto: t('camera.flashAuto'),
    on: t('camera.flashOn'),
    off: t('camera.flashOff'),
  };

  if (device === undefined) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{t('camera.unavailable')}</Text>
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>{t('camera.needPermission')}</Text>
        <Pressable
          onPress={() => {
            requestPermission().catch(() => undefined);
          }}
          style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('common.allow')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Pinch anywhere on the preview to zoom (two fingers, continuous). */}
      <GestureDetector gesture={pinch}>
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          format={format}
          isActive={cameraActive}
          photo={currentMode === 'photo'}
          video={currentMode === 'video'}
          audio={currentMode === 'video'}
          zoom={zoom}
          // Torch (LED lamp) stays lit through the video recording when enabled.
          torch={currentMode === 'video' && torch ? 'on' : 'off'}
        />
      </GestureDetector>

      {/* Live zoom readout, shown only while zoomed past the default lens. */}
      {zoomFactor > 1.05 && (
        <View style={[styles.zoomPill, { top: insets.top + 12 }]} pointerEvents="none">
          <Text style={styles.zoomPillText}>{zoomFactor.toFixed(1)}×</Text>
        </View>
      )}

      {showPlateFrame && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.hintBanner}>
            <Text style={styles.hintTitle}>{t('camera.shootCar')}</Text>
            <Text style={styles.hintSub}>
              {t('camera.plateAnywhere')}
            </Text>
          </View>
        </View>
      )}

      {counterText !== undefined && counterText.length > 0 && (
        <View style={styles.counterBanner} pointerEvents="none">
          <Text testID="capture-counter" style={styles.counterText}>
            {counterText}
          </Text>
        </View>
      )}

      {recording && (
        <View style={styles.recBadge} pointerEvents="none">
          <Text style={styles.recDot}>●</Text>
          <Text style={styles.recTime}>{mmss(elapsed)}</Text>
        </View>
      )}

      {/* Top-end controls: flash (photo) / torch (video). */}
      <View style={[styles.topEnd, { top: insets.top + 12 }]}>
        {currentMode === 'photo' && device.hasFlash && (
          <Pressable testID="flash-toggle" onPress={cycleFlash} style={styles.roundBtn}>
            <Text style={styles.roundIcon}>{flash === 'off' ? '🚫' : '⚡'}</Text>
            <Text style={styles.roundLabel}>{flashLabel[flash]}</Text>
          </Pressable>
        )}
        {currentMode === 'video' && device.hasTorch && (
          <Pressable
            testID="torch-toggle"
            onPress={() => setTorch(v => !v)}
            style={[styles.roundBtn, torch && styles.roundBtnOn]}>
            <Text style={styles.roundIcon}>🔦</Text>
          </Pressable>
        )}
      </View>

      {allowModeSwitch && !recording && (
        // Anchored ABOVE the shutter (76px tall at insets.bottom+24) with a gap,
        // so the two never overlap regardless of the navigation-bar inset.
        <View style={[styles.modeToggle, { bottom: insets.bottom + 24 + 76 + 18 }]}>
          <Pressable
            testID="mode-photo"
            onPress={() => setCurrentMode('photo')}
            style={[styles.modeBtn, currentMode === 'photo' && styles.modeBtnActive]}>
            <Text style={[styles.modeText, currentMode === 'photo' && styles.modeTextActive]}>
              {t('camera.photo')}
            </Text>
          </Pressable>
          <Pressable
            testID="mode-video"
            onPress={() => setCurrentMode('video')}
            style={[styles.modeBtn, currentMode === 'video' && styles.modeBtnActive]}>
            <Text style={[styles.modeText, currentMode === 'video' && styles.modeTextActive]}>
              {t('camera.video')}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.controls, { bottom: insets.bottom + 24 }]}>
        <Pressable onPress={onCancel} style={styles.sideBtn} disabled={recording}>
          <Text style={styles.sideText}>{t('common.cancel')}</Text>
        </Pressable>

        {currentMode === 'photo' ? (
          <Pressable testID="shutter" onPress={takePhoto} style={styles.shutter}>
            {busy ? <ActivityIndicator color="#111" /> : <View style={styles.shutterInner} />}
          </Pressable>
        ) : (
          <Pressable
            testID="rec-toggle"
            onPress={recording ? stopVideo : startVideo}
            style={[styles.shutter, recording && styles.shutterRec]}>
            <View style={recording ? styles.stopInner : styles.recInner} />
          </Pressable>
        )}

        {onDone !== undefined ? (
          <Pressable
            testID="capture-done"
            onPress={onDone}
            style={styles.sideBtn}
            disabled={recording}>
            <Text style={[styles.sideText, styles.doneText]}>{t('camera.done')}</Text>
          </Pressable>
        ) : (
          <View style={styles.sideBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBanner: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  hintTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hintSub: { color: '#ffd54f', fontSize: 13, marginTop: 4, textAlign: 'center' },
  recBadge: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recDot: { color: '#ff5252', fontSize: 14, marginEnd: 8 },
  recTime: { color: '#fff', fontSize: 16, fontVariant: ['tabular-nums'] },
  counterBanner: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  counterText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  topEnd: {
    position: 'absolute',
    end: 16,
    alignItems: 'center',
    gap: 12,
  },
  roundBtn: {
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  roundBtnOn: { backgroundColor: '#f9a825' },
  roundIcon: { fontSize: 20 },
  roundLabel: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },
  zoomPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  zoomPillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modeToggle: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 22,
    padding: 4,
  },
  modeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 18 },
  modeBtnActive: { backgroundColor: '#fff' },
  modeText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modeTextActive: { color: '#111' },
  doneText: { color: '#4caf50', fontWeight: '700' },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  sideBtn: { width: 72, alignItems: 'center' },
  sideText: { color: '#fff', fontSize: 16 },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRec: { backgroundColor: '#fff' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', borderWidth: 2, borderColor: '#bbb' },
  recInner: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e53935' },
  stopInner: { width: 26, height: 26, borderRadius: 5, backgroundColor: '#e53935' },
  fallback: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  cancelBtn: { backgroundColor: '#1565c0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
