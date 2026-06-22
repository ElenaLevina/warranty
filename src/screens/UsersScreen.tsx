/**
 * UsersScreen (admin-only) — list of provisioned users. Tap a row to edit;
 * the header button adds a new user. Reachable only when the logged-in user has
 * the 'admin' role (the Start screen hides the entry otherwise).
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Users'>;

export function UsersScreen({ navigation }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const users = useAuthStore(s => s.users);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {users.length === 0 ? (
          <Text style={styles.empty}>{t('auth.noUsersYet')}</Text>
        ) : (
          users.map(u => (
            <Pressable
              key={u.id}
              testID={`user-row-${u.id}`}
              style={styles.row}
              onPress={() => navigation.navigate('UserEdit', { userId: u.id })}>
              <Text style={styles.name}>
                {u.firstName} {u.lastName}
              </Text>
              <Text style={styles.meta}>
                {(u.role === 'admin' ? t('auth.roleAdmin') : t('auth.roleMechanic')) +
                  ' · ' +
                  t(`languages.${u.language}`)}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
      <View style={styles.cta}>
        <PrimaryButton
          testID="add-user"
          title={t('auth.addUser')}
          onPress={() => navigation.navigate('UserEdit', {})}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, gap: 10 },
  empty: { textAlign: 'center', color: '#777', marginTop: 40, fontSize: 15 },
  row: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  name: { fontSize: 17, fontWeight: '700', color: '#222' },
  meta: { fontSize: 13, color: '#777', marginTop: 4, textTransform: 'capitalize' },
  cta: { padding: 20, paddingTop: 0 },
});
