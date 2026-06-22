/**
 * UserEditScreen (admin-only) — create a new user or edit an existing one.
 * Fields: first name, last name, role (admin | mechanic), interface language,
 * PIN (required on create; on edit, blank keeps the current PIN).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices, useAuthStore, useAuthActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { LanguagePicker } from '../components/LanguagePicker';
import { isValidPin, type UserRole } from '../services/users/userService';
import type { AppLanguage } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'UserEdit'>;

export function UserEditScreen({ navigation, route }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { auth } = useServices();
  const actions = useAuthActions();
  const userId = route.params.userId;
  const existing = useAuthStore(s => s.users.find(u => u.id === userId)) ?? null;

  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [role, setRole] = useState<UserRole>(existing?.role ?? 'mechanic');
  const [language, setLanguage] = useState<AppLanguage>(existing?.language ?? 'en');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isEdit = existing !== null;

  const save = (): void => {
    if (firstName.trim().length === 0 || lastName.trim().length === 0) {
      setError('auth.nameRequired');
      return;
    }
    // PIN is required on create; on edit a blank PIN keeps the current one.
    if ((!isEdit || pin.length > 0) && !isValidPin(pin)) {
      setError('auth.pinFormat');
      return;
    }
    try {
      if (isEdit && existing !== null) {
        auth.updateUser(existing.id, { firstName, lastName, role, language, pin });
      } else {
        auth.addUser({ firstName, lastName, role, language, pin });
      }
      actions.refreshUsers();
      navigation.goBack();
    } catch {
      setError('auth.cannotRemoveAdmin');
    }
  };

  const remove = (): void => {
    if (existing === null) {
      return;
    }
    Alert.alert(t('auth.deleteUser'), t('auth.deleteUserConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.deleteUser'),
        style: 'destructive',
        onPress: () => {
          try {
            auth.removeUser(existing.id);
            actions.refreshUsers();
            navigation.goBack();
          } catch {
            setError('auth.cannotRemoveAdmin');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('auth.firstName')}</Text>
        <TextInput testID="first-name-input" style={styles.input} value={firstName} onChangeText={setFirstName} />

        <Text style={styles.label}>{t('auth.lastName')}</Text>
        <TextInput testID="last-name-input" style={styles.input} value={lastName} onChangeText={setLastName} />

        <Text style={styles.label}>{t('auth.role')}</Text>
        <View style={styles.roleRow}>
          {(['mechanic', 'admin'] as UserRole[]).map(r => {
            const active = role === r;
            return (
              <Pressable
                key={r}
                testID={`role-${r}`}
                onPress={() => setRole(r)}
                style={[styles.roleBtn, active && styles.roleBtnActive]}>
                <Text style={[styles.roleText, active && styles.roleTextActive]}>
                  {r === 'admin' ? t('auth.roleAdmin') : t('auth.roleMechanic')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>{t('settings.language')}</Text>
        <LanguagePicker value={language} onChange={setLanguage} />

        <Text style={styles.label}>{t('auth.pin')}</Text>
        <TextInput
          testID="pin-input"
          style={styles.input}
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          value={pin}
          onChangeText={setPin}
        />
        {isEdit && <Text style={styles.hint}>{t('auth.pinKeepHint')}</Text>}

        {error !== null && (
          <Text testID="user-edit-error" style={styles.error}>
            {t(error)}
          </Text>
        )}

        <View style={styles.cta}>
          <PrimaryButton testID="save-user" title={t('settings.save')} onPress={save} />
        </View>

        {isEdit && (
          <Pressable testID="delete-user" onPress={remove} style={styles.delete}>
            <Text style={styles.deleteText}>{t('auth.deleteUser')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  label: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#222',
    backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: '#888', marginTop: 6 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cfd8dc',
  },
  roleBtnActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  roleText: { fontSize: 15, color: '#333' },
  roleTextActive: { color: '#fff', fontWeight: '700' },
  error: { color: '#c62828', fontSize: 14, marginTop: 16 },
  cta: { marginTop: 28 },
  delete: { marginTop: 20, alignItems: 'center' },
  deleteText: { color: '#c62828', fontSize: 15, fontWeight: '600' },
});
