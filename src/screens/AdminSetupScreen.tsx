import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAuthActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

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
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const submit = (): void => {
    // UI is locked to Hebrew (service-center request): no language choice.
    actions.createFirstAdmin({ firstName, lastName, language: 'he', pin, pinConfirm });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Text style={styles.logoEmoji}>🔧</Text>
            <Text style={styles.logo}>Warranty</Text>
          </View>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24 },
  header: { alignItems: 'center', marginTop: 8, marginBottom: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' },
  logoEmoji: { fontSize: 30 },
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
