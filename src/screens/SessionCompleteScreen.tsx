import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionComplete'>;

export function SessionCompleteScreen({ navigation, route }: Props): React.JSX.Element {
  const { plate, photoCount, videoCount } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.check}>✓</Text>
        <Text style={styles.plate}>{plate}</Text>
        <Text testID="summary" style={styles.summary}>
          Сохранено: {photoCount} фото, {videoCount} видео
        </Text>
      </View>
      <PrimaryButton
        testID="new-inspection"
        title="Новый осмотр"
        onPress={() => navigation.popToTop()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  check: {
    fontSize: 72,
    color: '#2e7d32',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e8f5e9',
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
  },
  plate: { fontSize: 30, fontWeight: '900', color: '#222', marginTop: 24 },
  summary: { fontSize: 16, color: '#666', marginTop: 10 },
});
