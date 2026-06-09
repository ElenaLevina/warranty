// Тестируем dev-путь захвата (генерация файла + mock-OCR), не зависящий от
// источника кадра. Принудительно выключаем реальную камеру для этих тестов.
jest.mock('../../app/featureFlags', () => ({
  FEATURES: { realCamera: false, nativeOcr: false, nativeCrypto: false },
}));

import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { StoreProvider } from '../../store/StoreProvider';
import { createTestServices } from '../../services/container';
import { StartScreen } from '../StartScreen';
import { PlateCaptureScreen } from '../PlateCaptureScreen';
import { SessionCompleteScreen } from '../SessionCompleteScreen';
import type { OcrResult } from '../../types';

const okOcr: OcrResult = { candidates: [{ text: '12345678', confidence: 0.97 }] };

function makeNav(): Record<string, jest.Mock> {
  return {
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    popToTop: jest.fn(),
    goBack: jest.fn(),
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function press(tree: ReactTestRenderer, testID: string): void {
  tree.root.findByProps({ testID }).props.onPress();
}

describe('StartScreen', () => {
  it('navigates to PlateCapture on "Начать осмотр"', async () => {
    const services = createTestServices({ ocrScript: okOcr });
    const nav = makeNav();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <StartScreen navigation={nav as never} route={{ key: 'k', name: 'Start' } as never} />
        </StoreProvider>,
      );
    });
    await flush();

    await act(async () => press(tree, 'start-inspection'));
    expect(nav.navigate).toHaveBeenCalledWith('PlateCapture');
  });
});

describe('PlateCaptureScreen', () => {
  it('captures -> recognizes -> confirms -> opens ActiveSession', async () => {
    const services = createTestServices({ ocrScript: okOcr });
    services.auth.register('tester', '1234'); // a mechanic must be unlocked
    const nav = makeNav();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <PlateCaptureScreen
            navigation={nav as never}
            route={{ key: 'k', name: 'PlateCapture' } as never}
          />
        </StoreProvider>,
      );
    });

    // Снять -> распознавание -> результат
    await act(async () => press(tree, 'shutter'));
    await flush();

    const plate = tree.root.findByProps({ testID: 'recognized-plate' });
    expect(plate.props.children).toBe('123-45-678');

    // Верно -> создаётся кейс, переход в ActiveSession
    await act(async () => press(tree, 'confirm-plate'));
    await flush();

    expect(nav.replace).toHaveBeenCalledWith('ActiveSession', { plate: '123-45-678' });
    // кейс реально создан на (in-memory) диске
    const meta = await services.files.readSession('123-45-678');
    expect(meta.status).toBe('open');
    expect(meta.files[0]?.name).toBe('plate.jpg');
  });
});

describe('SessionCompleteScreen', () => {
  it('shows the summary and returns to start', async () => {
    const services = createTestServices({ ocrScript: okOcr });
    const nav = makeNav();
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <StoreProvider services={services}>
          <SessionCompleteScreen
            navigation={nav as never}
            route={
              {
                key: 'k',
                name: 'SessionComplete',
                params: { plate: '123-45-678', photoCount: 8, videoCount: 1 },
              } as never
            }
          />
        </StoreProvider>,
      );
    });

    const summary = tree.root.findByProps({ testID: 'summary' });
    expect(summary.props.children).toEqual(['Сохранено: ', 8, ' фото, ', 1, ' видео']);

    await act(async () => press(tree, 'new-inspection'));
    expect(nav.popToTop).toHaveBeenCalled();
  });
});
