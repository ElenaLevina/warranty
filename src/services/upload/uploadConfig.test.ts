import { MmkvUploadConfig } from './uploadConfig';

describe('MmkvUploadConfig.set sanitization', () => {
  it('strips RTL direction marks, zero-width chars and whitespace from baseUrl/token', () => {
    const cfg = new MmkvUploadConfig();
    // A URL that LOOKS correct but carries a right-to-left mark (U+200F), a
    // zero-width space (U+200B), a leading space and a trailing slash — exactly
    // what a Hebrew keyboard can inject.
    cfg.set({
      enabled: true,
      baseUrl: ' http://192.168.68.153:8080‏/',
      token: 'bmw​ ',
    });
    const s = cfg.get();
    expect(s.baseUrl).toBe('http://192.168.68.153:8080');
    expect(s.token).toBe('bmw');
  });

  it('leaves a clean value untouched', () => {
    const cfg = new MmkvUploadConfig();
    cfg.set({ enabled: true, baseUrl: 'http://10.0.0.5:8080', token: 'secret' });
    expect(cfg.get().baseUrl).toBe('http://10.0.0.5:8080');
    expect(cfg.get().token).toBe('secret');
  });
});
