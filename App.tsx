/**
 * Warranty — модуль фото/видео механика. Точка входа.
 *
 * @format
 */

import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { StoreProvider } from './src/store/StoreProvider';
import { createAppServices } from './src/app/createAppServices';
import type { AppServices } from './src/services/container';

function App(): React.JSX.Element {
  const servicesRef = useRef<AppServices | null>(null);
  if (!servicesRef.current) {
    servicesRef.current = createAppServices();
  }
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StoreProvider services={servicesRef.current}>
          <RootNavigator />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
