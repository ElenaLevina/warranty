import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StoreProvider } from '../../store/StoreProvider';
import { createTestServices } from '../../services/container';
import { RegisterScreen } from '../RegisterScreen';
import { LockScreen } from '../LockScreen';

function setText(tree: ReactTestRenderer, testID: string, value: string): void {
  tree.root.findByProps({ testID }).props.onChangeText(value);
}
function press(tree: ReactTestRenderer, testID: string): void {
  tree.root.findByProps({ testID }).props.onPress();
}

describe('RegisterScreen', () => {
  it('registers a mechanic and unlocks the app', async () => {
    const services = createTestServices();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <RegisterScreen />
        </StoreProvider>,
      );
    });

    await act(async () => {
      setText(tree, 'login-input', 'Ivan');
      setText(tree, 'pin-input', '1234');
      setText(tree, 'pin-confirm-input', '1234');
    });
    await act(async () => press(tree, 'register-submit'));

    expect(services.auth.isRegistered()).toBe(true);
    expect(services.auth.current()?.login).toBe('Ivan');
  });

  it('shows an error when PINs do not match', async () => {
    const services = createTestServices();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <RegisterScreen />
        </StoreProvider>,
      );
    });

    await act(async () => {
      setText(tree, 'login-input', 'Ivan');
      setText(tree, 'pin-input', '1234');
      setText(tree, 'pin-confirm-input', '9999');
    });
    await act(async () => press(tree, 'register-submit'));

    expect(services.auth.isRegistered()).toBe(false);
    expect(tree.root.findByProps({ testID: 'auth-error' }).props.children).toMatch(/совпад/i);
  });
});

describe('LockScreen', () => {
  it('rejects a wrong PIN and accepts the correct one', async () => {
    const services = createTestServices();
    services.auth.register('Ivan', '1234');
    services.auth.lock();

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <LockScreen />
        </StoreProvider>,
      );
    });

    await act(async () => {
      setText(tree, 'pin-input', '0000');
    });
    await act(async () => press(tree, 'unlock-submit'));
    expect(services.auth.current()).toBeNull();

    await act(async () => {
      setText(tree, 'pin-input', '1234');
    });
    await act(async () => press(tree, 'unlock-submit'));
    expect(services.auth.current()?.login).toBe('Ivan');
  });
});
