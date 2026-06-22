import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices, useSessionStore, useSessionActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { FEATURES } from '../app/featureFlags';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveSession'>;

const DEV_VIDEO_DURATION_SEC = 8;

export function ActiveSessionScreen({ navigation }: Props): React.JSX.Element {
  const services = useServices();
  const actions = useSessionActions();
  const active = useSessionStore(s => s.active);
  const phase = useSessionStore(s => s.phase);
  const [description, setDescription] = useState(active?.description ?? '');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  // Lift the bottom bar above the keyboard. RN 0.85 edge-to-edge means
  // adjustResize doesn't shrink the window, and the reported keyboard height
  // omits the system navigation bar — so we add the safe-area bottom inset.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const barLift = keyboardHeight > 0 ? keyboardHeight + insets.bottom : insets.bottom;

  if (active === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>Сессия завершена</Text>
          <PrimaryButton
            testID="back-to-start"
            title="На старт"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Start' }] })}
          />
        </View>
      </SafeAreaView>
    );
  }

  const files = active.files;
  const photoCount = files.filter(f => f.type === 'photo').length;
  const videoCount = files.filter(f => f.type === 'video').length;
  const recent = files.slice(-9);

  // Persist the typed description to disk. Called before any transition
  // (finish / open camera) so the latest text is never lost.
  const persistDescription = (): Promise<void> =>
    actions.setDescription(description).catch(() => undefined);

  const onPhoto = async (): Promise<void> => {
    await persistDescription();
    if (FEATURES.realCamera) {
      navigation.navigate('Capture', { caseId: active.case_id, initialMode: 'photo' });
      return;
    }
    const path = await services.camera.capturePhoto();
    await actions.addPhoto(path);
  };

  const onVideo = async (): Promise<void> => {
    await persistDescription();
    if (FEATURES.realCamera) {
      navigation.navigate('Capture', { caseId: active.case_id, initialMode: 'video' });
      return;
    }
    const clip = await services.camera.captureVideo(DEV_VIDEO_DURATION_SEC);
    await actions.addVideo(clip.path, clip.durationSec);
  };

  const finish = (): void => {
    Alert.alert('Завершить сессию?', 'Добавить файлы будет невозможно.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Завершить',
        style: 'destructive',
        onPress: async () => {
          const plate = active.plate_number;
          const p = photoCount;
          const v = videoCount;
          try {
            await persistDescription(); // save the description BEFORE closing
            await actions.finish();
            navigation.replace('SessionComplete', { plate, photoCount: p, videoCount: v });
          } catch (e) {
            Alert.alert('Не удалось завершить', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.plate}>{active.plate_number}</Text>
          <Text testID="file-counter" style={styles.counter}>
            {files.length} файлов · {photoCount} фото, {videoCount} видео
          </Text>

          <View style={styles.grid}>
            {recent.map(f => (
              <View key={f.name} style={styles.tile}>
                <Text style={styles.tileIcon}>{f.type === 'video' ? '🎬' : '🖼'}</Text>
                <Text style={styles.tileName} numberOfLines={1}>
                  {f.name}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.captureRow}>
            <View style={styles.flex}>
              <PrimaryButton testID="take-photo" title="📷 Фото" onPress={onPhoto} loading={phase === 'busy'} />
            </View>
            <View style={styles.gap} />
            <View style={styles.flex}>
              <PrimaryButton testID="record-video" title="🎥 Видео" variant="secondary" onPress={onVideo} />
            </View>
          </View>
        </ScrollView>

        {/* Bottom bar lifted above the keyboard (and the system nav bar when
            the keyboard is closed), so description + ЗАКОНЧИЛ stay visible. */}
        <View style={[styles.bottomBar, { marginBottom: barLift }]}>
          <Text style={styles.label}>Описание</Text>
          <TextInput
            testID="description-input"
            style={styles.input}
            multiline
            placeholder="Опишите повреждения и детали…"
            value={description}
            onChangeText={setDescription}
            onBlur={() => {
              void persistDescription();
            }}
          />
          <PrimaryButton
            testID="finish-session"
            title="ЗАКОНЧИЛ"
            variant="danger"
            onPress={finish}
            loading={phase === 'busy'}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  content: { padding: 20 },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  empty: { textAlign: 'center', marginBottom: 24, color: '#444', fontSize: 18, fontWeight: '700' },
  plate: { fontSize: 32, fontWeight: '900', color: '#222', textAlign: 'center' },
  counter: { fontSize: 14, color: '#777', textAlign: 'center', marginTop: 6, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  tile: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  tileIcon: { fontSize: 26 },
  tileName: { fontSize: 10, color: '#555', marginVertical: 4 },
  captureRow: { flexDirection: 'row', marginBottom: 4 },
  gap: { width: 12 },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#eceff1',
    backgroundColor: '#fff',
  },
  label: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    padding: 12,
    minHeight: 56,
    maxHeight: 110,
    textAlignVertical: 'top',
    fontSize: 15,
    marginBottom: 12,
  },
});
