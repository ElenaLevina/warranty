/**
 * SettingsScreen — configure where finished case files are sent on the LAN
 * (the PC receiver). Edited by the employee responsible for forwarding data.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Switch, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { CaseListItem } from '../types';
import { useServices, useSessionActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';
import { APP_CONFIG } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type CheckState = 'idle' | 'checking' | 'ok' | 'fail';

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const { uploadConfig, upload } = useServices();
  const sessionActions = useSessionActions();
  const initial = uploadConfig.get();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [token, setToken] = useState(initial.token);
  const [check, setCheck] = useState<CheckState>('idle');
  /** Diagnostic detail of the last test (actual HTTP status / error). */
  const [detail, setDetail] = useState('');
  const [cases, setCases] = useState<CaseListItem[] | null>(null);
  const [loadingCases, setLoadingCases] = useState(false);
  /** Per-case send state: caseId -> 'sending' | 'done' | 'fail'. */
  const [sendState, setSendState] = useState<Record<string, 'sending' | 'done' | 'fail'>>({});

  const loadCases = async (): Promise<void> => {
    setLoadingCases(true);
    try {
      setCases(await sessionActions.listResendCases());
    } catch {
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  };

  const sendCase = async (caseId: string): Promise<void> => {
    uploadConfig.set({ enabled, baseUrl, token }); // ensure the receiver config is applied
    setSendState(s => ({ ...s, [caseId]: 'sending' }));
    try {
      await sessionActions.resendCase(caseId);
      setSendState(s => ({ ...s, [caseId]: 'done' }));
    } catch {
      setSendState(s => ({ ...s, [caseId]: 'fail' }));
    }
  };

  const save = (): void => {
    uploadConfig.set({ enabled, baseUrl, token });
    navigation.goBack();
  };

  const testConnection = async (): Promise<void> => {
    uploadConfig.set({ enabled, baseUrl, token }); // sanitizes; checkConnection reads config
    setCheck('checking');
    setDetail('');
    const ok = await upload.checkConnection();
    setCheck(ok ? 'ok' : 'fail');
    // Diagnostic probe on the SANITIZED values, so we see the real reason
    // (401 vs timeout vs bad address) — helps triage field connection issues.
    const s = uploadConfig.get();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${s.baseUrl}/v1/health`, {
        headers: { Authorization: `Bearer ${s.token}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      // raw=length of the field as typed (reveals a hidden char: clean URL is 26);
      // clean=length after ASCII sanitization.
      setDetail(`HTTP ${res.status} · raw${baseUrl.length}/clean${s.baseUrl.length} · ${s.baseUrl}`);
    } catch (e) {
      setDetail(
        `${e instanceof Error ? e.message : String(e)} · raw${baseUrl.length}/clean${s.baseUrl.length} · ${s.baseUrl}`,
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('settings.uploadHeader')}</Text>
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
          {detail.length > 0 && (
            <Text testID="conn-detail" style={styles.detail}>
              {detail}
            </Text>
          )}
        </View>

        <View style={styles.save}>
          <PrimaryButton testID="upload-save" title={t('settings.save')} onPress={save} />
        </View>

        <Text style={[styles.title, styles.uploadTitle]}>{t('settings.resendTitle')}</Text>
        <Text style={styles.note}>{t('settings.resendNote')}</Text>

        {cases === null ? (
          <PrimaryButton
            testID="resend-load"
            title={t('settings.resendLoad')}
            variant="secondary"
            loading={loadingCases}
            onPress={loadCases}
          />
        ) : cases.length === 0 ? (
          <Text style={styles.note}>{t('settings.resendNone')}</Text>
        ) : (
          cases.map(c => {
            const st = sendState[c.case_id];
            return (
              <View key={c.case_id} testID={`resend-row-${c.case_id}`} style={styles.caseRow}>
                <View style={styles.caseInfo}>
                  <Text style={styles.casePlate}>{c.plate_number}</Text>
                  <Text style={styles.caseMeta}>
                    {(c.order_number !== undefined ? `№${c.order_number} · ` : '') +
                      new Date(c.session_start).toLocaleDateString() +
                      ' · ' +
                      t('start.files', { count: c.file_count })}
                  </Text>
                </View>
                {st === 'done' ? (
                  <Text style={styles.caseDone}>✓</Text>
                ) : (
                  <Pressable
                    testID={`resend-send-${c.case_id}`}
                    style={styles.caseSend}
                    disabled={st === 'sending'}
                    onPress={() => sendCase(c.case_id)}>
                    {st === 'sending' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.caseSendText}>
                        {st === 'fail' ? t('settings.resendFail') : t('settings.resendOne')}
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        <Text style={styles.version}>v{APP_CONFIG.appVersion}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#222' },
  uploadTitle: { marginTop: 28 },
  note: { fontSize: 13, color: '#777', marginTop: 6, marginBottom: 16 },
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
  detail: { color: '#607d8b', fontSize: 12, marginTop: 8, textAlign: 'center' },
  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eceff1',
  },
  caseInfo: { flex: 1, paddingEnd: 12 },
  casePlate: { fontSize: 16, fontWeight: '700', color: '#222' },
  caseMeta: { fontSize: 13, color: '#777', marginTop: 2 },
  caseSend: {
    minWidth: 96,
    alignItems: 'center',
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  caseSendText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  caseDone: { color: '#2e7d32', fontSize: 22, fontWeight: '900', minWidth: 96, textAlign: 'center' },
  version: { color: '#b0bec5', fontSize: 12, textAlign: 'center', marginTop: 24 },
  save: { marginTop: 28 },
});
