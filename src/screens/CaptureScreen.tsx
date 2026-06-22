/**
 * CaptureScreen — persistent camera for a case: take a series of photos/videos
 * without leaving the camera, switch Фото/Видео inline, then «Готово» → session.
 * Reached after plate confirmation (and from the session's Фото/Видео buttons)
 * when the real camera is enabled.
 */
import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useTranslation } from 'react-i18next';
import { CameraCapture } from '../components/CameraCapture';
import { useSessionStore, useSessionActions } from '../store/StoreProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Capture'>;

export function CaptureScreen({ navigation, route }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { caseId, initialMode } = route.params;
  const actions = useSessionActions();
  const active = useSessionStore(s => s.active);

  // Count only files captured here (exclude the mandatory plate.jpg).
  const files = active?.files ?? [];
  const photoCount = files.filter(f => f.type === 'photo' && f.name !== 'plate.jpg').length;
  const videoCount = files.filter(f => f.type === 'video').length;

  const goToSession = (): void => {
    navigation.replace('ActiveSession', { caseId });
  };

  return (
    <CameraCapture
      mode={initialMode ?? 'photo'}
      allowModeSwitch
      counterText={t('camera.counter', { photos: photoCount, videos: videoCount })}
      onPhoto={path => {
        actions.addPhoto(path).catch(() => undefined);
      }}
      onVideo={(path, durationSec) => {
        actions.addVideo(path, durationSec).catch(() => undefined);
      }}
      onDone={goToSession}
      onCancel={goToSession}
    />
  );
}
