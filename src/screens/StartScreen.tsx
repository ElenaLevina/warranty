import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import {
  useSessionStore,
  useSessionActions,
  useAuthStore,
  useAuthActions,
} from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Start'>;

export function StartScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const openSessions = useSessionStore(s => s.openSessions);
  const actions = useSessionActions();
  const mechanic = useAuthStore(s => s.current);
  const authActions = useAuthActions();

  useEffect(() => {
    actions.bootstrap().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = async (caseId: string): Promise<void> => {
    await actions.resume(caseId);
    navigation.navigate('ActiveSession', { caseId });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        {mechanic !== null && (
          <Text testID="current-mechanic" style={styles.mechanic}>
            {mechanic.firstName} {mechanic.lastName}
          </Text>
        )}
        <View style={styles.topActions}>
          {mechanic?.role === 'admin' && (
            <Pressable testID="open-users" onPress={() => navigation.navigate('Users')} hitSlop={8}>
              <Text style={styles.settings}>👥 {t('auth.manageUsers')}</Text>
            </Pressable>
          )}
          <Pressable testID="open-settings" onPress={() => navigation.navigate('Settings')} hitSlop={8}>
            <Text style={styles.settings}>⚙ {t('start.settings')}</Text>
          </Pressable>
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
        <Text style={styles.logo}>🔧 Warranty</Text>
        <Text style={styles.subtitle}>{t('start.subtitle')}</Text>
      </View>

      <View style={styles.cta}>
        <PrimaryButton
          testID="start-inspection"
          title={t('start.startInspection')}
          onPress={() => navigation.navigate('PlateCapture')}
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
  logo: { fontSize: 34, fontWeight: '800', color: '#1565c0' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' },
  cta: { marginTop: 48 },
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
  rowMeta: { fontSize: 13, color: '#777', marginTop: 4 },
});
