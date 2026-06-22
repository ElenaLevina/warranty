import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAuthActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

/**
 * Lock screen (status 'locked'): the app is provisioned but no one is logged in.
 * The user is selected from the admin-provided list (no typing of names) and
 * unlocks with the PIN the admin assigned.
 */
export function UserPickerScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const users = useAuthStore(s => s.users);
  const error = useAuthStore(s => s.error);
  const actions = useAuthActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  const selected = users.find(u => u.id === selectedId) ?? null;

  const select = (id: string): void => {
    setSelectedId(id);
    setPin('');
  };

  const submit = (): void => {
    if (selectedId !== null) {
      actions.login(selectedId, pin);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>🔧 Warranty</Text>
          <Text style={styles.subtitle}>{t('auth.selectUser')}</Text>
        </View>

        <View style={styles.list}>
          {users.map(u => {
            const active = u.id === selectedId;
            return (
              <Pressable
                key={u.id}
                testID={`user-${u.id}`}
                onPress={() => select(u.id)}
                style={[styles.row, active && styles.rowActive]}>
                <Text style={[styles.rowName, active && styles.rowNameActive]}>
                  {u.firstName} {u.lastName}
                </Text>
                <Text style={[styles.badge, active && styles.badgeActive]}>
                  {u.role === 'admin' ? t('auth.roleAdmin') : t('auth.roleMechanic')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selected !== null && (
          <View style={styles.pinBlock}>
            <Text style={styles.pinLabel}>{t('auth.loginAs', { name: `${selected.firstName} ${selected.lastName}` })}</Text>
            <TextInput
              testID="pin-input"
              style={styles.input}
              placeholder="••••"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              value={pin}
              onChangeText={setPin}
              autoFocus
            />

            {error !== null && (
              <Text testID="auth-error" style={styles.error}>
                {t(error)}
              </Text>
            )}

            <View style={styles.cta}>
              <PrimaryButton testID="unlock-submit" title={t('auth.unlock')} onPress={submit} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24 },
  header: { alignItems: 'center', marginTop: 24, marginBottom: 24 },
  logo: { fontSize: 30, fontWeight: '800', color: '#1565c0' },
  subtitle: { fontSize: 16, color: '#444', fontWeight: '700', marginTop: 10 },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    backgroundColor: '#fff',
  },
  rowActive: { borderColor: '#1565c0', backgroundColor: '#e8f0fe' },
  rowName: { fontSize: 17, fontWeight: '700', color: '#222' },
  rowNameActive: { color: '#0d47a1' },
  badge: { fontSize: 12, color: '#777', textTransform: 'uppercase' },
  badgeActive: { color: '#1565c0' },
  pinBlock: { marginTop: 28 },
  pinLabel: { fontSize: 15, color: '#222', fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    padding: 16,
    fontSize: 22,
    textAlign: 'center',
    letterSpacing: 8,
    color: '#222',
    backgroundColor: '#fff',
  },
  error: { color: '#c62828', fontSize: 14, marginTop: 16, textAlign: 'center' },
  cta: { marginTop: 24 },
});
