import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useAuthActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

/**
 * Returning-launch lock screen: the app is registered but locked. The mechanic
 * unlocks with the PIN. "Сменить механика" resets the registration so a
 * different employee can register (cases stay isolated by mechanic_id).
 */
export function LockScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const error = useAuthStore(s => s.error);
  const login = useAuthStore(s => s.registeredLogin);
  const actions = useAuthActions();
  const [pin, setPin] = useState('');

  const submit = (): void => {
    actions.unlock(pin);
  };

  const switchUser = (): void => {
    Alert.alert(t('auth.switchTitle'), t('auth.switchMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.switchConfirm'), style: 'destructive', onPress: () => actions.switchUser() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>🔧 Warranty</Text>
        {login !== null && (
          <Text testID="lock-login" style={styles.login}>
            {t('auth.loginAs', { name: login })}
          </Text>
        )}
        <Text style={styles.subtitle}>{t('auth.enterPin')}</Text>
      </View>

      <View style={styles.form}>
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

        <Pressable testID="switch-user" onPress={switchUser} style={styles.switch}>
          <Text style={styles.switchText}>{t('auth.switchUser')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  header: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
  logo: { fontSize: 30, fontWeight: '800', color: '#1565c0' },
  login: { fontSize: 18, color: '#222', fontWeight: '700', marginTop: 10 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 6 },
  form: { flex: 1 },
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
  switch: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#1565c0', fontSize: 14, fontWeight: '600' },
});
