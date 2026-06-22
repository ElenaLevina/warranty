/**
 * LanguagePicker — a row of buttons to choose an interface language. Controlled
 * component: it does not change the live app language itself; the parent decides
 * when to apply the selection (e.g. on save / login).
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { APP_LANGUAGES, type AppLanguage } from '../i18n';

interface Props {
  value: AppLanguage;
  onChange: (lng: AppLanguage) => void;
  testIDPrefix?: string;
}

export function LanguagePicker({ value, onChange, testIDPrefix = 'lang' }: Props): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      {APP_LANGUAGES.map(lng => {
        const active = value === lng;
        return (
          <Pressable
            key={lng}
            testID={`${testIDPrefix}-${lng}`}
            onPress={() => onChange(lng)}
            style={[styles.btn, active && styles.btnActive]}>
            <Text style={[styles.text, active && styles.textActive]}>{t(`languages.${lng}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cfd8dc',
  },
  btnActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  text: { fontSize: 15, color: '#333' },
  textActive: { color: '#fff', fontWeight: '700' },
});
