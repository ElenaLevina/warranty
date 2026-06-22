import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAuthActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { LanguagePicker } from '../components/LanguagePicker';
import type { AppLanguage } from '../i18n';

/**
 * First-launch screen (status 'no-users'): create the administrator account.
 * The admin then provisions the other users from the management screen.
 * On success the auth status becomes 'authenticated' and RootNavigator swaps
 * to the main app stack.
 */
export function AdminSetupScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const error = useAuthStore(s => s.error);
  const actions = useAuthActions();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const submit = (): void => {
    actions.createFirstAdmin({ firstName, lastName, language, pin, pinConfirm });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>🔧 Warranty</Text>
          <Text style={styles.title}>{t('auth.adminSetupTitle')}</Text>
          <Text style={styles.hint}>{t('auth.adminSetupHint')}</Text>
        </View>

        <Text style={styles.label}>{t('auth.firstName')}</Text>
        <TextInput
          testID="first-name-input"
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
        />

        <Text style={styles.label}>{t('auth.lastName')}</Text>
        <TextInput
          testID="last-name-input"
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
        />

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

        <Text style={styles.label}>{t('auth.pinRepeat')}</Text>
        <TextInput
          testID="pin-confirm-input"
          style={styles.input}
          placeholder="••••"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          value={pinConfirm}
          onChangeText={setPinConfirm}
        />

        {error !== null && (
          <Text testID="auth-error" style={styles.error}>
            {t(error)}
          </Text>
        )}

        <View style={styles.cta}>
          <PrimaryButton testID="create-admin" title={t('auth.createAdmin')} onPress={submit} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24 },
  header: { alignItems: 'center', marginTop: 8, marginBottom: 16 },
  logo: { fontSize: 30, fontWeight: '800', color: '#1565c0' },
  title: { fontSize: 18, fontWeight: '800', color: '#222', marginTop: 12 },
  hint: { fontSize: 13, color: '#666', marginTop: 6, textAlign: 'center' },
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
  error: { color: '#c62828', fontSize: 14, marginTop: 16 },
  cta: { marginTop: 28 },
});
