/**
 * Корневой навигатор: stack из 4 экранов (ТЗ §3).
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { StartScreen } from '../screens/StartScreen';
import { PlateCaptureScreen } from '../screens/PlateCaptureScreen';
import { ActiveSessionScreen } from '../screens/ActiveSessionScreen';
import { SessionCompleteScreen } from '../screens/SessionCompleteScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Start">
        <Stack.Screen name="Start" component={StartScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="PlateCapture"
          component={PlateCaptureScreen}
          options={{ title: 'Номер авто' }}
        />
        <Stack.Screen
          name="ActiveSession"
          component={ActiveSessionScreen}
          options={{ title: 'Осмотр', headerBackVisible: false }}
        />
        <Stack.Screen
          name="SessionComplete"
          component={SessionCompleteScreen}
          options={{ title: 'Готово', headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
