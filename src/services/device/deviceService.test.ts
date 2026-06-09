import { MmkvDeviceService } from './deviceService';

describe('MmkvDeviceService', () => {
  it('returns a stable, well-formed id across calls', () => {
    const dev = new MmkvDeviceService();
    const a = dev.getDeviceId();
    const b = dev.getDeviceId();
    expect(a).toBe(b); // generated once, then persisted
    expect(a).toMatch(/^dev_[0-9a-f]{12}$/);
  });
});
