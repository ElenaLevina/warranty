/**
 * OrderCaptureScreen — mandatory FIRST step of an inspection: scan the
 * work-order form and confirm the recognized 6-digit order number, then
 * proceed to the plate scan. The form photo is NOT stored in the case
 * (recognizeOrder deletes the temp file right after OCR).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices, useSessionActions, useSessionStore } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { CameraCapture } from '../components/CameraCapture';
import { FEATURES } from '../app/featureFlags';
import type { OrderNumberResult } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderCapture'>;
type Phase = 'camera' | 'recognizing' | 'result';

export function OrderCaptureScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const services = useServices();
  const actions = useSessionActions();
  const lastOcrText = useSessionStore(s => s.lastOcrText);
  const [phase, setPhase] = useState<Phase>('camera');
  const [result, setResult] = useState<OrderNumberResult | null>(null);

  const processImage = async (path: string): Promise<void> => {
    setPhase('recognizing');
    try {
      const res = await actions.recognizeOrder(path);
      setResult(res);
    } catch {
      setResult({ ok: false, reason: 'not_found' });
    } finally {
      setPhase('result');
    }
  };

  const devCapture = async (): Promise<void> => {
    const path = await services.camera.capturePhoto();
    await processImage(path);
  };

  const retake = (): void => {
    setResult(null);
    setPhase('camera');
  };

  const confirm = (): void => {
    if (result?.ok === true) {
      navigation.replace('PlateCapture', { orderNumber: result.orderNumber });
    }
  };

  const errorText = (reason: 'not_found' | 'low_confidence' | 'ambiguous'): string => {
    if (reason === 'ambiguous') {
      return t('order.ambiguous');
    }
    return reason === 'low_confidence' ? t('order.lowConfidence') : t('order.notRecognized');
  };

  // Real camera (on the phone): live preview, no plate frame.
  if (phase === 'camera' && FEATURES.realCamera) {
    return (
      <CameraCapture
        mode="photo"
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
            <Text style={styles.hint}>{t('order.shootForm')}</Text>
            <Text style={styles.frameHint}>{t('order.hint')}</Text>
          </View>
          <PrimaryButton testID="shutter" title={t('plate.shoot')} onPress={devCapture} />
        </View>
      )}

      {phase === 'recognizing' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1565c0" />
          <Text style={styles.hint}>{t('order.recognizing')}</Text>
        </View>
      )}

      {phase === 'result' && (
        <View style={styles.center}>
          {result?.ok === true ? (
            <>
              <Text style={styles.order} testID="recognized-order">
                {result.orderNumber}
              </Text>
              <Text style={styles.hint}>{t('order.confirmQuestion')}</Text>
              <View style={styles.actions}>
                <PrimaryButton testID="confirm-order" title={t('plate.correct')} onPress={confirm} />
                <View style={styles.gap} />
                <PrimaryButton title={t('plate.retake')} variant="secondary" onPress={retake} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.error} testID="order-error">
                {errorText(result?.reason ?? 'not_found')}
              </Text>
              {__DEV__ && lastOcrText.length > 0 && (
                <Text style={styles.debug} testID="order-ocr-debug">
                  {t('plate.ocrSaw', { text: lastOcrText })}
                </Text>
              )}
              <PrimaryButton testID="retake" title={t('plate.retakeShort')} onPress={retake} />
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
  order: { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: 4 },
  error: { color: '#ff8a80', fontSize: 16, textAlign: 'center', marginBottom: 12 },
  debug: { color: '#90a4ae', fontSize: 12, textAlign: 'center', marginBottom: 20 },
  actions: { marginTop: 32, alignSelf: 'stretch' },
  gap: { height: 12 },
});
