import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  useSessionStore,
  useSessionActions,
  useAuthStore,
  useAuthActions,
  useServices,
} from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Start'>;

export function StartScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const openSessions = useSessionStore(s => s.openSessions);
  const pendingUploads = useSessionStore(s => s.pendingUploads);
  const uploading = useSessionStore(s => s.uploading);
  const uploadError = useSessionStore(s => s.uploadError);
  const error = useSessionStore(s => s.error);
  const actions = useSessionActions();
  const { upload } = useServices();
  const mechanic = useAuthStore(s => s.current);
  const authActions = useAuthActions();

  const [checking, setChecking] = useState(false);
  const [conn, setConn] = useState<'ok' | 'fail' | null>(null);

  useEffect(() => {
    actions.bootstrap().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkConnection = async (): Promise<void> => {
    setChecking(true);
    setConn(null);
    try {
      setConn((await upload.checkConnection()) ? 'ok' : 'fail');
    } catch {
      setConn('fail');
    } finally {
      setChecking(false);
    }
  };

  // Never fail silently: a session that cannot be opened must say so, otherwise
  // the tap looks like the app is ignoring the mechanic.
  const resume = async (caseId: string): Promise<void> => {
    try {
      await actions.resume(caseId);
      navigation.navigate('ActiveSession', { caseId });
    } catch (e) {
      Alert.alert(t('start.openFailed'), e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        {mechanic !== null && (
          <Text testID="current-mechanic" style={styles.mechanic}>
            {`${mechanic.firstName} ${mechanic.lastName}`.trim()}
          </Text>
        )}
        <View style={styles.topActions}>
          {/* Users + Settings are admin-only; mechanics see just "Log out". */}
          {mechanic?.role === 'admin' && (
            <>
              <Pressable testID="open-users" onPress={() => navigation.navigate('Users')} hitSlop={8}>
                <Text style={styles.settings}>👥 {t('auth.manageUsers')}</Text>
              </Pressable>
              <Pressable testID="open-settings" onPress={() => navigation.navigate('Settings')} hitSlop={8}>
                <Text style={styles.settings}>⚙ {t('start.settings')}</Text>
              </Pressable>
            </>
          )}
          <Pressable
            testID="lock-app"
            onPress={() => {
              actions.leaveActive();
              authActions.lock();
            }}
            hitSlop={8}>
            <Text style={styles.lock}>{t('start.logout')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.header}>
        <View style={styles.logoRow}>
            <Text style={styles.logoEmoji}>🔧</Text>
            <Text style={styles.logo}>Warranty</Text>
          </View>
        <Text style={styles.subtitle}>{t('start.subtitle')}</Text>
      </View>

      {error !== null && (
        <Text testID="start-error" style={styles.errorText}>
          {t(error)}
        </Text>
      )}

      {pendingUploads > 0 && (
        <View style={styles.uploadPanel}>
          <Text style={styles.pendingText}>{t('start.pendingCount', { count: pendingUploads })}</Text>
          <View style={styles.uploadRow}>
            <View style={styles.flex}>
              <PrimaryButton
                testID="check-connection"
                title={t('settings.checkConnection')}
                variant="secondary"
                loading={checking}
                disabled={uploading}
                onPress={checkConnection}
              />
            </View>
            <View style={styles.uploadGap} />
            <View style={styles.flex}>
              <PrimaryButton
                testID="send-to-pc"
                title={t('start.sendToPc')}
                loading={uploading}
                disabled={checking}
                onPress={() => actions.sendToPc().catch(() => undefined)}
              />
            </View>
          </View>
          {uploading && <Text style={styles.sendingText}>{t('start.sending')}</Text>}
          {!uploading && conn === 'ok' && <Text style={styles.connOk}>{t('settings.serverOk')}</Text>}
          {!uploading && conn === 'fail' && <Text style={styles.connFail}>{t('settings.serverFail')}</Text>}
          {!uploading && uploadError.length > 0 && (
            <Text testID="upload-error" style={styles.connFail}>{uploadError}</Text>
          )}
        </View>
      )}

      <View style={styles.cta}>
        <PrimaryButton
          testID="start-inspection"
          title={t('start.startInspection')}
          // The order-number scan is the mandatory first step of an inspection.
          onPress={() => navigation.navigate('OrderCapture')}
        />
      </View>

      {openSessions.length > 0 && (
        <View style={styles.openBlock}>
          <Text style={styles.openTitle}>{t('start.openSessions')}</Text>
          <FlatList
            data={openSessions}
            keyExtractor={item => item.case_id}
            renderItem={({ item }) => (
              <Pressable
                testID={`resume-${item.case_id}`}
                style={styles.row}
                onPress={() => resume(item.case_id)}>
                <Text style={styles.rowPlate}>{item.plate_number}</Text>
                {item.order_number !== undefined && (
                  <Text style={styles.rowOrder}>{t('order.orderLabel', { n: item.order_number })}</Text>
                )}
                <Text style={styles.rowMeta}>
                  {new Date(item.session_start).toLocaleString()} ·{' '}
                  {t('start.files', { count: item.file_count })}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 18, marginStart: 'auto' },
  mechanic: { fontSize: 14, color: '#455a64', fontWeight: '600' },
  settings: { fontSize: 14, color: '#1565c0', fontWeight: '600' },
  lock: { fontSize: 14, color: '#1565c0', fontWeight: '600' },
  header: { alignItems: 'center', marginTop: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' },
  logoEmoji: { fontSize: 34 },
  logo: { fontSize: 34, fontWeight: '800', color: '#1565c0' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' },
  cta: { marginTop: 48 },
  flex: { flex: 1 },
  uploadPanel: {
    marginTop: 24,
    backgroundColor: '#fff3e0',
    borderColor: '#ffb74d',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  uploadRow: { flexDirection: 'row', marginTop: 10 },
  uploadGap: { width: 10 },
  pendingText: { color: '#e65100', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  sendingText: { color: '#e65100', fontSize: 13, textAlign: 'center', marginTop: 10 },
  connOk: { color: '#2e7d32', fontSize: 13, textAlign: 'center', marginTop: 10 },
  connFail: { color: '#c62828', fontSize: 13, textAlign: 'center', marginTop: 10 },
  errorText: { color: '#c62828', fontSize: 13, textAlign: 'center', marginTop: 16 },
  openBlock: { marginTop: 36, flex: 1 },
  openTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#333' },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    marginBottom: 10,
  },
  rowPlate: { fontSize: 20, fontWeight: '700', color: '#222' },
  rowOrder: { fontSize: 14, fontWeight: '700', color: '#1565c0', marginTop: 2 },
  rowMeta: { fontSize: 13, color: '#777', marginTop: 4 },
});
