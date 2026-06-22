import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAuthActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

/**
 * First-launch registration: the mechanic enters a login and sets a PIN.
 * On success the auth status becomes 'authenticated' and RootNavigator swaps
 * to the main app stack (no manual navigation needed).
 */
export function RegisterScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const error = useAuthStore(s => s.error);
  const actions = useAuthActions();
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const submit = (): void => {
    actions.register(login, pin, pinConfirm);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>🔧 Warranty</Text>
        <Text style={styles.subtitle}>{t('auth.registerTitle')}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>{t('auth.login')}</Text>
        <TextInput
          testID="login-input"
          style={styles.input}
          placeholder="ivan"
          autoCapitalize="none"
          value={login}
          onChangeText={setLogin}
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
          <PrimaryButton testID="register-submit" title={t('auth.register')} onPress={submit} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  header: { alignItems: 'center', marginTop: 24, marginBottom: 24 },
  logo: { fontSize: 30, fontWeight: '800', color: '#1565c0' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 6 },
  form: { flex: 1 },
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
