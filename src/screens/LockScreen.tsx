import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore, useAuthActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

/**
 * Returning-launch lock screen: the app is registered but locked. The mechanic
 * unlocks with the PIN. "Сменить механика" resets the registration so a
 * different employee can register (cases stay isolated by mechanic_id).
 */
export function LockScreen(): React.JSX.Element {
  const error = useAuthStore(s => s.error);
  const actions = useAuthActions();
  const [pin, setPin] = useState('');

  const submit = (): void => {
    actions.unlock(pin);
  };

  const switchUser = (): void => {
    Alert.alert(
      'Сменить механика?',
      'Текущая регистрация будет удалена. Кейсы прежнего механика останутся, но будут недоступны новому.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Сменить', style: 'destructive', onPress: () => actions.switchUser() },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>🔧 Warranty</Text>
        <Text style={styles.subtitle}>Введите PIN для входа</Text>
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
            {error}
          </Text>
        )}

        <View style={styles.cta}>
          <PrimaryButton testID="unlock-submit" title="Войти" onPress={submit} />
        </View>

        <Pressable testID="switch-user" onPress={switchUser} style={styles.switch}>
          <Text style={styles.switchText}>Сменить механика</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  header: { alignItems: 'center', marginTop: 48, marginBottom: 32 },
  logo: { fontSize: 30, fontWeight: '800', color: '#1565c0' },
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
  },
  error: { color: '#c62828', fontSize: 14, marginTop: 16, textAlign: 'center' },
  cta: { marginTop: 24 },
  switch: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#1565c0', fontSize: 14, fontWeight: '600' },
});
