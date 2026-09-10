const { parseDurationFrames, framesToSeconds } = require('../src/utils/duration');
const Emulator = require('../src/core/emulator');

describe('duration parsing', () => {
  test('seconds, including fractional ones', () => {
    expect(parseDurationFrames('10s')).toBe(Math.round(10 * Emulator.NTSC_FPS));
    // The old parser matched only whole numbers, so "1.5s" fell back to its
    // default and quietly captured the wrong length.
    expect(parseDurationFrames('1.5s')).toBe(Math.round(1.5 * Emulator.NTSC_FPS));
  });

  test('milliseconds, minutes and explicit frames', () => {
    expect(parseDurationFrames('500ms')).toBe(Math.round(0.5 * Emulator.NTSC_FPS));
    expect(parseDurationFrames('2m')).toBe(Math.round(120 * Emulator.NTSC_FPS));
    expect(parseDurationFrames('900f')).toBe(900);
  });

  test('a bare number is a frame count', () => {
    expect(parseDurationFrames('300')).toBe(300);
    expect(parseDurationFrames(300)).toBe(300);
  });

  test('nonsense throws instead of defaulting', () => {
    expect(() => parseDurationFrames('banana')).toThrow(/Cannot parse duration/);
    expect(() => parseDurationFrames('')).toThrow(/Cannot parse duration/);
  });

  test('frames convert back to seconds at the NTSC rate', () => {
    expect(framesToSeconds(Math.round(Emulator.NTSC_FPS))).toBeCloseTo(1, 2);
  });
});
