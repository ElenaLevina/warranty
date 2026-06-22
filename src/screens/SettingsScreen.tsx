/**
 * SettingsScreen — configure where finished case files are sent on the LAN
 * (the PC receiver). Edited by the employee responsible for forwarding data.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type CheckState = 'idle' | 'checking' | 'ok' | 'fail';

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const { uploadConfig, upload } = useServices();
  const initial = uploadConfig.get();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [token, setToken] = useState(initial.token);
  const [check, setCheck] = useState<CheckState>('idle');

  const save = (): void => {
    uploadConfig.set({ enabled, baseUrl, token });
    navigation.goBack();
  };

  const testConnection = async (): Promise<void> => {
    uploadConfig.set({ enabled, baseUrl, token }); // checkConnection reads from config
    setCheck('checking');
    const ok = await upload.checkConnection();
    setCheck(ok ? 'ok' : 'fail');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Передача файлов на ПК</Text>
        <Text style={styles.note}>
          После завершения сессии файлы отправляются на компьютер в локальной сети.
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Включить передачу</Text>
          <Switch testID="upload-enabled" value={enabled} onValueChange={setEnabled} />
        </View>

        <Text style={styles.label}>Адрес ПК (IP:порт)</Text>
        <TextInput
          testID="upload-baseurl"
          style={styles.input}
          placeholder="http://192.168.1.50:8080"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={baseUrl}
          onChangeText={setBaseUrl}
        />

        <Text style={styles.label}>Токен доступа</Text>
        <TextInput
          testID="upload-token"
          style={styles.input}
          placeholder="секретный токен"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={token}
          onChangeText={setToken}
        />

        <View style={styles.check}>
          <PrimaryButton
            testID="upload-check"
            title="Проверить соединение"
            variant="secondary"
            loading={check === 'checking'}
            onPress={testConnection}
          />
          {check === 'ok' && <Text style={styles.ok}>✓ Сервер доступен</Text>}
          {check === 'fail' && (
            <Text style={styles.fail}>✗ Нет связи или неверный токен</Text>
          )}
        </View>

        <View style={styles.save}>
          <PrimaryButton testID="upload-save" title="Сохранить" onPress={save} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#222' },
  note: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  label: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  check: { marginTop: 24 },
  ok: { color: '#2e7d32', fontSize: 14, marginTop: 10, textAlign: 'center' },
  fail: { color: '#c62828', fontSize: 14, marginTop: 10, textAlign: 'center' },
  save: { marginTop: 28 },
});
