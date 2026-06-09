import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}

export function PrimaryButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
}: Props): React.JSX.Element {
  const bg =
    variant === 'danger' ? '#c62828' : variant === 'secondary' ? '#455a64' : '#1565c0';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1 },
      ]}>
      <View style={styles.inner}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.label}>{title}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20 },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
