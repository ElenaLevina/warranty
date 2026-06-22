/**
 * Root navigator with an authentication gate (CLAUDE.md §8):
 *  - no-users      -> AdminSetupScreen (first launch: create the administrator)
 *  - locked        -> UserPickerScreen (pick a user, enter PIN)
 *  - authenticated -> main app stack (4 screens, ТЗ §3)
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { StartScreen } from '../screens/StartScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { UserEditScreen } from '../screens/UserEditScreen';
import { PlateCaptureScreen } from '../screens/PlateCaptureScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { ActiveSessionScreen } from '../screens/ActiveSessionScreen';
import { SessionCompleteScreen } from '../screens/SessionCompleteScreen';
import { AdminSetupScreen } from '../screens/AdminSetupScreen';
import { UserPickerScreen } from '../screens/UserPickerScreen';
import { useAuthStore } from '../store/StoreProvider';
import { useTranslation } from 'react-i18next';

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator();

function AppStack(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Stack.Navigator initialRouteName="Start">
      <Stack.Screen name="Start" component={StartScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('settings.title') }} />
      <Stack.Screen name="Users" component={UsersScreen} options={{ title: t('auth.manageUsers') }} />
      <Stack.Screen name="UserEdit" component={UserEditScreen} options={{ title: t('auth.editUser') }} />
      <Stack.Screen name="PlateCapture" component={PlateCaptureScreen} options={{ title: t('plate.title') }} />
      <Stack.Screen name="Capture" component={CaptureScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ActiveSession"
        component={ActiveSessionScreen}
        options={{ title: t('session.title'), headerBackVisible: false }}
      />
      <Stack.Screen
        name="SessionComplete"
        component={SessionCompleteScreen}
        options={{ title: 'Готово', headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function AuthFlow({ hasUsers }: { hasUsers: boolean }): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      {hasUsers ? (
        <AuthStack.Screen name="Lock" component={UserPickerScreen} />
      ) : (
        <AuthStack.Screen name="AdminSetup" component={AdminSetupScreen} />
      )}
    </AuthStack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const status = useAuthStore(s => s.status);
  return (
    <NavigationContainer>
      {status === 'authenticated' ? <AppStack /> : <AuthFlow hasUsers={status === 'locked'} />}
    </NavigationContainer>
  );
}
