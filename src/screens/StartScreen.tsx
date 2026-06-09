import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useSessionStore, useSessionActions } from '../store/StoreProvider';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Start'>;

export function StartScreen({ navigation }: Props): React.JSX.Element {
  const openSessions = useSessionStore(s => s.openSessions);
  const actions = useSessionActions();

  useEffect(() => {
    actions.bootstrap().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = async (plate: string): Promise<void> => {
    await actions.resume(plate);
    navigation.navigate('ActiveSession', { plate });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>🔧 Warranty</Text>
        <Text style={styles.subtitle}>Документирование гарантийного случая</Text>
      </View>

      <View style={styles.cta}>
        <PrimaryButton
          testID="start-inspection"
          title="Начать осмотр"
          onPress={() => navigation.navigate('PlateCapture')}
        />
      </View>

      {openSessions.length > 0 && (
        <View style={styles.openBlock}>
          <Text style={styles.openTitle}>Незакрытые сессии</Text>
          <FlatList
            data={openSessions}
            keyExtractor={item => item.plate_number}
            renderItem={({ item }) => (
              <Pressable
                testID={`resume-${item.plate_number}`}
                style={styles.row}
                onPress={() => resume(item.plate_number)}>
                <Text style={styles.rowPlate}>{item.plate_number}</Text>
                <Text style={styles.rowMeta}>
                  {new Date(item.session_start).toLocaleString()} · {item.file_count} файлов
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  header: { alignItems: 'center', marginTop: 40 },
  logo: { fontSize: 34, fontWeight: '800', color: '#1565c0' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, textAlign: 'center' },
  cta: { marginTop: 48 },
  openBlock: { marginTop: 36, flex: 1 },
  openTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#333' },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    marginBottom: 10,
  },
  rowPlate: { fontSize: 20, fontWeight: '700', color: '#222' },
  rowMeta: { fontSize: 13, color: '#777', marginTop: 4 },
});
