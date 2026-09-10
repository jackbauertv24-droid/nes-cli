const jsnes = require('jsnes');
const { boot } = require('./helpers');
const Emulator = require('../src/core/emulator');
const InputCommand = require('../src/commands/input');

// input.nes latches the controller into $0010 every frame, MSB first in the
// standard read order, so each button maps to one known bit.
const BIT = { A: 0x80, B: 0x40, SELECT: 0x20, START: 0x10, UP: 0x08, DOWN: 0x04, LEFT: 0x02, RIGHT: 0x01 };

function latched(emulator) {
  return emulator.getNES().cpu.mem[0x10];
}

describe('controller input', () => {
  test('every button name maps to a real jsnes constant', () => {
    // The original bug: jsnes exports BUTTON_A, not A, so every lookup was
    // undefined and no press ever reached the emulator.
    for (const name of Object.keys(BIT)) {
      expect(Emulator.BUTTONS[name]).toBe(jsnes.Controller[`BUTTON_${name}`]);
      expect(typeof Emulator.BUTTONS[name]).toBe('number');
    }
  });

  test('an unknown button is rejected rather than silently ignored', () => {
    expect(() => Emulator.normalizeButton('TURBO')).toThrow(/Unknown button/);
  });

  test.each(Object.entries(BIT))('holding %s reaches the running program', (name, mask) => {
    const emulator = boot('input.nes');

    expect(latched(emulator) & mask).toBe(0);

    emulator.buttonDown(1, name);
    emulator.run(3);
    expect(latched(emulator) & mask).toBe(mask);

    emulator.buttonUp(1, name);
    emulator.run(3);
    expect(latched(emulator) & mask).toBe(0);
  });

  test('button names are case insensitive', () => {
    const emulator = boot('input.nes');
    emulator.buttonDown(1, 'start');
    emulator.run(3);
    expect(latched(emulator) & BIT.START).toBe(BIT.START);
  });

  test('the input command delivers a press the program can see', () => {
    const emulator = boot('input.nes');
    const seen = [];

    // Sample every frame so a press that is too short to be polled shows up
    // as a miss rather than passing by accident.
    const command = new InputCommand(emulator);
    const originalRun = emulator.run.bind(emulator);
    emulator.run = (frames) => {
      for (let i = 0; i < frames; i++) {
        originalRun(1);
        seen.push(latched(emulator));
      }
    };

    command.execute({ button: 'A' });
    expect(seen.some((v) => (v & BIT.A) === BIT.A)).toBe(true);
  });

  test('a sequence presses each button in turn', () => {
    const emulator = boot('input.nes');
    const seen = [];
    const originalRun = emulator.run.bind(emulator);
    emulator.run = (frames) => {
      for (let i = 0; i < frames; i++) {
        originalRun(1);
        seen.push(latched(emulator));
      }
    };

    new InputCommand(emulator).execute({ sequence: 'A,B,START' });

    expect(seen.some((v) => v & BIT.A)).toBe(true);
    expect(seen.some((v) => v & BIT.B)).toBe(true);
    expect(seen.some((v) => v & BIT.START)).toBe(true);
  });
});
