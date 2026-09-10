const fs = require('fs');
const path = require('path');
const { boot, tmpdir } = require('./helpers');
const Emulator = require('../src/core/emulator');
const AudioCommand = require('../src/commands/audio');
const WAVHandler = require('../src/formats/audio/wav');

function readWavHeader(file) {
  const buf = fs.readFileSync(file);
  return {
    sampleRate: buf.readUInt32LE(24),
    byteRate: buf.readUInt32LE(28),
    bitsPerSample: buf.readUInt16LE(34),
    dataBytes: buf.readUInt32LE(40)
  };
}

describe('audio capture', () => {
  test('the emulator generates at the rate it was constructed with', () => {
    expect(new Emulator().sampleRate).toBe(Emulator.DEFAULT_SAMPLE_RATE);
    expect(new Emulator({ sampleRate: 22050 }).sampleRate).toBe(22050);
  });

  test('the WAV header matches the rate the samples were actually produced at', () => {
    // The original bug: jsnes defaults to 48000 but the header always said
    // 44100, so every capture played about 9% slow.
    const emulator = boot('solid.nes', 1);
    const dir = tmpdir('audio');
    const output = path.join(dir, 'out.wav');

    new AudioCommand(emulator).execute({ duration: '1s', output });

    const header = readWavHeader(output);
    expect(header.sampleRate).toBe(emulator.sampleRate);
    expect(header.byteRate).toBe(emulator.sampleRate * 2);
    expect(header.bitsPerSample).toBe(16);
  });

  test('a one second capture really lasts one second', () => {
    const emulator = boot('solid.nes', 1);
    const dir = tmpdir('audio-len');
    const output = path.join(dir, 'out.wav');

    new AudioCommand(emulator).execute({ duration: '1s', output });

    const { dataBytes, sampleRate } = readWavHeader(output);
    const seconds = dataBytes / 2 / sampleRate;
    expect(seconds).toBeGreaterThan(0.95);
    expect(seconds).toBeLessThan(1.05);
  });

  test('writing a WAV without a sample rate is refused', () => {
    expect(() => WAVHandler.writeWAV([0], '/tmp/never.wav')).toThrow(/sample rate/);
  });

  test('an unparseable duration is reported rather than silently defaulted', () => {
    const emulator = boot('solid.nes', 1);
    expect(new AudioCommand(emulator).execute({ duration: 'banana' })).toBe(false);
  });
});
