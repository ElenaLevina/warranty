import RNRestart from 'react-native-restart';
import { isRtlLanguage, applyDirection } from './rtl';

describe('rtl', () => {
  beforeEach(() => {
    (RNRestart.restart as jest.Mock).mockClear();
  });

  it('classifies RTL languages', () => {
    expect(isRtlLanguage('he')).toBe(true);
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
    expect(isRtlLanguage('ru')).toBe(false);
  });

  it('does not restart when the direction already matches (LTR default)', () => {
    expect(applyDirection('en')).toBe(false);
    expect(RNRestart.restart).not.toHaveBeenCalled();
  });

  it('restarts when switching to an RTL language', () => {
    expect(applyDirection('he')).toBe(true);
    expect(RNRestart.restart).toHaveBeenCalledTimes(1);
  });
});
