import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices, useSessionActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { CameraCapture } from '../components/CameraCapture';
import { FEATURES } from '../app/featureFlags';
import type { PlateResult } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PlateCapture'>;
type Phase = 'camera' | 'recognizing' | 'result';

export function PlateCaptureScreen({ navigation }: Props): React.JSX.Element {
  const services = useServices();
  const actions = useSessionActions();
  const [phase, setPhase] = useState<Phase>('camera');
  const [result, setResult] = useState<PlateResult | null>(null);
  const [tmpPath, setTmpPath] = useState<string | null>(null);

  /** Общий путь: снимок (реальный или dev) -> распознавание -> показ результата. */
  const processImage = async (path: string): Promise<void> => {
    setTmpPath(path);
    setPhase('recognizing');
    try {
      const res = await actions.recognizePlate(path);
      setResult(res);
    } catch {
      setResult({ ok: false, reason: 'not_found' });
    } finally {
      setPhase('result');
    }
  };

  /** Dev-захват (эмулятор/без камеры): генерирует файл и прогоняет mock-OCR. */
  const devCapture = async (): Promise<void> => {
    const path = await services.camera.capturePhoto();
    await processImage(path);
  };

  const retake = (): void => {
    setResult(null);
    setTmpPath(null);
    setPhase('camera');
  };

  const confirm = async (): Promise<void> => {
    if (result?.ok !== true || tmpPath === null) {
      return;
    }
    await actions.startCase(result.plate, tmpPath);
    navigation.replace('ActiveSession', { plate: result.plate });
  };

  // Реальная камера (на телефоне): живой preview с рамкой номера.
  if (phase === 'camera' && FEATURES.realCamera) {
    return (
      <CameraCapture
        mode="photo"
        showPlateFrame
        onPhoto={path => {
          processImage(path).catch(() => undefined);
        }}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {phase === 'camera' && (
        <View style={styles.cameraArea}>
          <View style={styles.hintBlock}>
            <Text style={styles.hint}>Сфотографируйте автомобиль</Text>
            <Text style={styles.frameHint}>
              Номер распознаётся автоматически в любом месте кадра
            </Text>
          </View>
          <PrimaryButton testID="shutter" title="Снять" onPress={devCapture} />
        </View>
      )}

      {phase === 'recognizing' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565c0" />
          <Text style={styles.hint}>Распознаём номер…</Text>
        </View>
      )}

      {phase === 'result' && (
        <View style={styles.center}>
          {result?.ok === true ? (
            <>
              <Text style={styles.plate} testID="recognized-plate">
                {result.plate}
              </Text>
              <Text style={styles.hint}>Номер распознан. Верно?</Text>
              <View style={styles.actions}>
                <PrimaryButton testID="confirm-plate" title="✓ Верно" onPress={confirm} />
                <View style={styles.gap} />
                <PrimaryButton title="✗ Переснять" variant="secondary" onPress={retake} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.error} testID="ocr-error">
                {result?.reason === 'low_confidence'
                  ? 'Номер распознан неуверенно. Переснимите при хорошем освещении.'
                  : 'Не удалось распознать номер. Переснимите.'}
              </Text>
              <PrimaryButton testID="retake" title="Переснять" onPress={retake} />
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  cameraArea: { flex: 1, padding: 20, justifyContent: 'space-between' },
  hintBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { color: '#eee', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  frameHint: { color: '#ffd54f', fontSize: 13, textAlign: 'center', marginTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  plate: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: 2 },
  error: { color: '#ff8a80', fontSize: 16, textAlign: 'center', marginBottom: 24 },
  actions: { marginTop: 32, alignSelf: 'stretch' },
  gap: { height: 12 },
});
