import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StoreProvider } from '../../store/StoreProvider';
import { createTestServices } from '../../services/container';
import { AdminSetupScreen } from '../AdminSetupScreen';
import { UserPickerScreen } from '../UserPickerScreen';

function setText(tree: ReactTestRenderer, testID: string, value: string): void {
  tree.root.findByProps({ testID }).props.onChangeText(value);
}
function press(tree: ReactTestRenderer, testID: string): void {
  tree.root.findByProps({ testID }).props.onPress();
}

describe('AdminSetupScreen', () => {
  it('creates the first administrator and unlocks the app', async () => {
    const services = createTestServices();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <AdminSetupScreen />
        </StoreProvider>,
      );
    });

    await act(async () => {
      setText(tree, 'first-name-input', 'Anna');
      setText(tree, 'last-name-input', 'Admin');
      setText(tree, 'pin-input', '1234');
      setText(tree, 'pin-confirm-input', '1234');
    });
    await act(async () => press(tree, 'create-admin'));

    expect(services.auth.hasUsers()).toBe(true);
    expect(services.auth.current()?.firstName).toBe('Anna');
    expect(services.auth.current()?.role).toBe('admin');
  });

  it('shows an error when PINs do not match', async () => {
    const services = createTestServices();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <AdminSetupScreen />
        </StoreProvider>,
      );
    });

    await act(async () => {
      setText(tree, 'first-name-input', 'Anna');
      setText(tree, 'last-name-input', 'Admin');
      setText(tree, 'pin-input', '1234');
      setText(tree, 'pin-confirm-input', '9999');
    });
    await act(async () => press(tree, 'create-admin'));

    expect(services.auth.hasUsers()).toBe(false);
    // Error is translated from the 'auth.pinMismatch' key (English under test).
    expect(tree.root.findByProps({ testID: 'auth-error' }).props.children).toMatch(/match/i);
  });
});

describe('UserPickerScreen', () => {
  it('selects a user, rejects a wrong PIN, then accepts the correct one', async () => {
    const services = createTestServices();
    const user = services.auth.addUser({
      firstName: 'Ivan',
      lastName: 'Petrov',
      role: 'mechanic',
      language: 'ru',
      pin: '1234',
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <UserPickerScreen />
        </StoreProvider>,
      );
    });

    // Pick the user from the list, then enter the PIN.
    await act(async () => press(tree, `user-${user.id}`));

    await act(async () => setText(tree, 'pin-input', '0000'));
    await act(async () => press(tree, 'unlock-submit'));
    expect(services.auth.current()).toBeNull();

    await act(async () => setText(tree, 'pin-input', '1234'));
    await act(async () => press(tree, 'unlock-submit'));
    expect(services.auth.current()?.id).toBe(user.id);
  });
});
