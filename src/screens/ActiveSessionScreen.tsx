import React, { useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices, useSessionStore, useSessionActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { MediaTile } from '../components/MediaTile';
import { FEATURES } from '../app/featureFlags';
import type { OrderType } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveSession'>;

const DEV_VIDEO_DURATION_SEC = 8;
const ORDER_TYPES: OrderType[] = ['warranty', 'recall'];

export function ActiveSessionScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const services = useServices();
  const actions = useSessionActions();
  const active = useSessionStore(s => s.active);
  const phase = useSessionStore(s => s.phase);
  const insets = useSafeAreaInsets();
  const [typePickerOpen, setTypePickerOpen] = useState(false);


  // "To start" header button: save the session (it stays open on disk) and go
  // back to Start, where the mechanic can begin a new inspection or resume any
  // open one. Nothing is lost — every photo already wrote session.json.
  useLayoutEffect(() => {
    navigation.setOptions({
      // Hide the screen title ("בדיקה"): next to the RTL "To Start" button it
      // merged into one run. The plate/order below is the real heading anyway.
      headerTitle: '',
      headerLeft: () => (
        <Pressable
          testID="session-to-start"
          hitSlop={12}
          onPress={() => {
            actions.leaveActive();
            navigation.reset({ index: 0, routes: [{ name: 'Start' }] });
          }}>
          <Text style={styles.headerBtn}>🏠 {t('session.toStart')}</Text>
        </Pressable>
      ),
      // Discard the whole session (wrong car for this order). Destructive → confirm.
      headerRight: () => (
        <Pressable
          testID="delete-session"
          hitSlop={12}
          onPress={() => {
            Alert.alert(t('session.deleteSessionTitle'), t('session.deleteSessionMsg'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('session.deleteSessionConfirm'),
                style: 'destructive',
                onPress: async () => {
                  try {
                    await actions.deleteActiveSession();
                    navigation.reset({ index: 0, routes: [{ name: 'Start' }] });
                  } catch (e) {
                    Alert.alert(t('session.finishFailedTitle'), e instanceof Error ? e.message : String(e));
                  }
                },
              },
            ]);
          }}>
          <Text style={styles.headerDanger}>🗑</Text>
        </Pressable>
      ),
    });
  }, [navigation, actions, t]);

  if (active === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{t('session.finished')}</Text>
          <PrimaryButton
            testID="back-to-start"
            title={t('session.toStart')}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Start' }] })}
          />
        </View>
      </SafeAreaView>
    );
  }

  const files = active.files;
  const photoCount = files.filter(f => f.type === 'photo').length;
  const videoCount = files.filter(f => f.type === 'video').length;
  const orderType = active.order_type;
  const recommended = active.recommendation === true;

  const typeLabel = (v: OrderType): string =>
    v === 'recall' ? t('session.orderTypeRecall') : t('session.orderTypeWarranty');

  const onPhoto = async (): Promise<void> => {
    if (FEATURES.realCamera) {
      navigation.navigate('Capture', { caseId: active.case_id, initialMode: 'photo' });
      return;
    }
    const path = await services.camera.capturePhoto();
    await actions.addPhoto(path);
  };

  const onVideo = async (): Promise<void> => {
    if (FEATURES.realCamera) {
      navigation.navigate('Capture', { caseId: active.case_id, initialMode: 'video' });
      return;
    }
    const clip = await services.camera.captureVideo(DEV_VIDEO_DURATION_SEC);
    await actions.addVideo(clip.path, clip.durationSec);
  };

  // Long-press a thumbnail to delete a low-quality file. The plate photo is the
  // case anchor and is protected (a short notice instead of a delete prompt).
  const confirmDelete = (entry: { name: string }): void => {
    if (entry.name === 'plate.jpg') {
      Alert.alert(t('session.plateProtected'));
      return;
    }
    Alert.alert(t('session.deleteTitle'), t('session.deleteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('session.deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          actions.deleteFile(entry.name).catch(() => undefined);
        },
      },
    ]);
  };

  const pickType = (v: OrderType): void => {
    setTypePickerOpen(false);
    actions.setOrderType(v).catch(() => undefined);
  };

  const finish = (): void => {
    Alert.alert(t('session.finishTitle'), t('session.finishMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('session.finishConfirm'),
        style: 'destructive',
        onPress: async () => {
          const plate = active.plate_number;
          const p = photoCount;
          const v = videoCount;
          try {
            await actions.finish();
            navigation.replace('SessionComplete', {
              plate,
              photoCount: p,
              videoCount: v,
              ...(active.order_number !== undefined ? { orderNumber: active.order_number } : {}),
            });
          } catch (e) {
            Alert.alert(t('session.finishFailedTitle'), e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Keep the fixed bottom bar above the keyboard if a text field is ever
          added back here (edge-to-edge neutralizes manifest adjustResize). */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Fixed compact header: plate, order, counter never scroll away. */}
        <View style={styles.header}>
          <Text style={styles.plate}>{active.plate_number}</Text>
          {active.order_number !== undefined && (
            <Text testID="order-number" style={styles.order}>
              {t('order.orderLabel', { n: active.order_number })}
            </Text>
          )}
          <Text testID="file-counter" style={styles.counter}>
            {t('session.counter', { count: files.length, photos: photoCount, videos: videoCount })}
          </Text>
        </View>

        {/* Only the media grid scrolls. */}
        <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            {files.map(f => (
              <MediaTile
                key={f.name}
                caseId={active.case_id}
                entry={f}
                onPress={entry =>
                  navigation.navigate('MediaViewer', {
                    caseId: active.case_id,
                    fileName: entry.name,
                    fileType: entry.type,
                  })
                }
                onLongPress={confirmDelete}
              />
            ))}
          </View>
        </ScrollView>

        {/* Fixed bottom bar: capture buttons + card type + finish. */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.captureRow}>
            <View style={styles.flex}>
              <PrimaryButton testID="take-photo" title={t('session.photo')} onPress={onPhoto} loading={phase === 'busy'} />
            </View>
            <View style={styles.gap} />
            <View style={styles.flex}>
              <PrimaryButton testID="record-video" title={t('session.video')} variant="secondary" onPress={onVideo} />
            </View>
          </View>
          {/* Same row: card type (סוג כרטיס, mandatory) + diagcode (דיאקוד, optional). */}
          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Text style={styles.label}>{t('session.orderType')}</Text>
              <Pressable
                testID="order-type-select"
                style={styles.select}
                onPress={() => setTypePickerOpen(true)}>
                <Text style={orderType === undefined ? styles.selectPlaceholder : styles.selectValue}>
                  {orderType === undefined ? t('session.orderTypePlaceholder') : typeLabel(orderType)}
                </Text>
                <Text style={styles.selectChevron}>▾</Text>
              </Pressable>
            </View>
            <View style={styles.formCol}>
              <Text style={styles.label}>{t('session.recommendation')}</Text>
              {/* Optional flag, off by default; persisted immediately on tap. */}
              <Pressable
                testID="recommendation-check"
                style={styles.checkBox}
                onPress={() => actions.setRecommendation(!recommended).catch(() => undefined)}>
                <Text style={recommended ? styles.checkOn : styles.checkOff}>
                  {recommended ? '☑' : '☐'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.finishGap} />
          <PrimaryButton
            testID="finish-session"
            title={t('session.finish')}
            variant="danger"
            onPress={finish}
            disabled={orderType === undefined}
            loading={phase === 'busy'}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={typePickerOpen} transparent animationType="fade" onRequestClose={() => setTypePickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTypePickerOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('session.orderType')}</Text>
            {ORDER_TYPES.map(v => (
              <Pressable
                key={v}
                testID={`order-type-${v}`}
                style={styles.modalOption}
                onPress={() => pickType(v)}>
                <Text style={styles.modalOptionText}>{typeLabel(v)}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 12 },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  empty: { textAlign: 'center', marginBottom: 24, color: '#444', fontSize: 18, fontWeight: '700' },
  headerBtn: { color: '#1565c0', fontSize: 16, fontWeight: '700', paddingHorizontal: 4 },
  headerDanger: { fontSize: 20, paddingHorizontal: 4 },
  plate: { fontSize: 28, fontWeight: '900', color: '#222', textAlign: 'center' },
  order: { fontSize: 15, fontWeight: '700', color: '#1565c0', textAlign: 'center', marginTop: 2 },
  counter: { fontSize: 13, color: '#777', textAlign: 'center', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  captureRow: { flexDirection: 'row', marginBottom: 10 },
  gap: { width: 12 },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eceff1',
    backgroundColor: '#fff',
  },
  label: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 6 },
  formRow: { flexDirection: 'row', gap: 12 },
  formCol: { flex: 1 },
  checkBox: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkOn: { fontSize: 28, color: '#1565c0', lineHeight: 32 },
  checkOff: { fontSize: 28, color: '#9aa5ad', lineHeight: 32 },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  selectPlaceholder: { fontSize: 16, color: '#9aa5ad' },
  selectValue: { fontSize: 16, color: '#222', fontWeight: '700' },
  selectChevron: { fontSize: 14, color: '#607d8b' },
  finishGap: { height: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 8 },
  modalTitle: { fontSize: 14, fontWeight: '700', color: '#607d8b', padding: 12 },
  modalOption: { paddingVertical: 16, paddingHorizontal: 12, borderRadius: 10 },
  modalOptionText: { fontSize: 18, color: '#222', fontWeight: '600' },
});
