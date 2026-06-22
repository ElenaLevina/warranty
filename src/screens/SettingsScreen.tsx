/**
 * SettingsScreen — configure where finished case files are sent on the LAN
 * (the PC receiver). Edited by the employee responsible for forwarding data.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useServices } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { setAppLanguage, APP_LANGUAGES, type AppLanguage } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type CheckState = 'idle' | 'checking' | 'ok' | 'fail';

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const { t, i18n } = useTranslation();
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
        <Text style={styles.label}>{t('settings.language')}</Text>
        <View style={styles.langRow}>
          {APP_LANGUAGES.map(lng => {
            const active = i18n.language === lng;
            return (
              <Pressable
                key={lng}
                testID={`lang-${lng}`}
                onPress={() => setAppLanguage(lng as AppLanguage)}
                style={[styles.langBtn, active && styles.langBtnActive]}>
                <Text style={[styles.langText, active && styles.langTextActive]}>
                  {t(`languages.${lng}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.title, styles.uploadTitle]}>{t('settings.uploadHeader')}</Text>
        <Text style={styles.note}>{t('settings.uploadNote')}</Text>

        <View style={styles.row}>
          <Text style={styles.label}>{t('settings.enableUpload')}</Text>
          <Switch testID="upload-enabled" value={enabled} onValueChange={setEnabled} />
        </View>

        <Text style={styles.label}>{t('settings.pcAddress')}</Text>
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

        <Text style={styles.label}>{t('settings.token')}</Text>
        <TextInput
          testID="upload-token"
          style={styles.input}
          placeholder="••••••"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={token}
          onChangeText={setToken}
        />

        <View style={styles.check}>
          <PrimaryButton
            testID="upload-check"
            title={t('settings.checkConnection')}
            variant="secondary"
            loading={check === 'checking'}
            onPress={testConnection}
          />
          {check === 'ok' && <Text style={styles.ok}>{t('settings.serverOk')}</Text>}
          {check === 'fail' && <Text style={styles.fail}>{t('settings.serverFail')}</Text>}
        </View>

        <View style={styles.save}>
          <PrimaryButton testID="upload-save" title={t('settings.save')} onPress={save} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#222' },
  uploadTitle: { marginTop: 24 },
  note: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 16 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  langBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cfd8dc',
  },
  langBtnActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  langText: { fontSize: 15, color: '#333' },
  langTextActive: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  label: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#fff',
  },
  check: { marginTop: 24 },
  ok: { color: '#2e7d32', fontSize: 14, marginTop: 10, textAlign: 'center' },
  fail: { color: '#c62828', fontSize: 14, marginTop: 10, textAlign: 'center' },
  save: { marginTop: 28 },
});
