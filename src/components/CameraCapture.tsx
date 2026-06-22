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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
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

  const [currentMode, setCurrentMode] = useState<CaptureMode>(mode);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const photo = await camera.current.takePhoto({ flash: 'auto' });
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
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={true}
        photo={currentMode === 'photo'}
        video={currentMode === 'video'}
        audio={currentMode === 'video'}
      />

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

      {allowModeSwitch && !recording && (
        <View style={styles.modeToggle}>
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
  recDot: { color: '#ff5252', fontSize: 14, marginRight: 8 },
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
  modeToggle: {
    position: 'absolute',
    bottom: 130,
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
