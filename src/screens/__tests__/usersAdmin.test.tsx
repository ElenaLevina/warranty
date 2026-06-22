import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StoreProvider } from '../../store/StoreProvider';
import { createTestServices } from '../../services/container';
import { UserEditScreen } from '../UserEditScreen';

function setText(tree: ReactTestRenderer, testID: string, value: string): void {
  tree.root.findByProps({ testID }).props.onChangeText(value);
}
function press(tree: ReactTestRenderer, testID: string): void {
  tree.root.findByProps({ testID }).props.onPress();
}
function makeNav() {
  return { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), reset: jest.fn() };
}

describe('UserEditScreen', () => {
  it('creates a new user from the form', async () => {
    const services = createTestServices();
    const nav = makeNav();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <UserEditScreen navigation={nav as never} route={{ key: 'k', name: 'UserEdit', params: {} } as never} />
        </StoreProvider>,
      );
    });

    await act(async () => {
      setText(tree, 'first-name-input', 'Ivan');
      setText(tree, 'last-name-input', 'Petrov');
      setText(tree, 'pin-input', '5678');
    });
    await act(async () => press(tree, 'role-mechanic'));
    await act(async () => press(tree, 'save-user'));

    const users = services.auth.users();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ firstName: 'Ivan', lastName: 'Petrov', role: 'mechanic' });
    expect(services.auth.login(users[0]!.id, '5678')?.id).toBe(users[0]!.id);
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('edits an existing user, keeping the PIN when left blank', async () => {
    const services = createTestServices();
    const u = services.auth.addUser({
      firstName: 'Ivan',
      lastName: 'Petrov',
      role: 'mechanic',
      language: 'ru',
      pin: '1234',
    });
    const nav = makeNav();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <UserEditScreen
            navigation={nav as never}
            route={{ key: 'k', name: 'UserEdit', params: { userId: u.id } } as never}
          />
        </StoreProvider>,
      );
    });

    // Form is prefilled from the existing user.
    expect(tree.root.findByProps({ testID: 'first-name-input' }).props.value).toBe('Ivan');

    await act(async () => setText(tree, 'last-name-input', 'Sidorov'));
    await act(async () => press(tree, 'save-user')); // blank PIN -> keep

    const edited = services.auth.users().find(x => x.id === u.id);
    expect(edited?.lastName).toBe('Sidorov');
    expect(services.auth.login(u.id, '1234')?.id).toBe(u.id); // PIN unchanged
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('shows a validation error when the name is empty', async () => {
    const services = createTestServices();
    const nav = makeNav();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <UserEditScreen navigation={nav as never} route={{ key: 'k', name: 'UserEdit', params: {} } as never} />
        </StoreProvider>,
      );
    });

    await act(async () => setText(tree, 'pin-input', '5678'));
    await act(async () => press(tree, 'save-user'));

    expect(services.auth.users()).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'user-edit-error' }).props.children).toMatch(/name/i);
  });
});
