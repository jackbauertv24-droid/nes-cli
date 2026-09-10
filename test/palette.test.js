const { boot, pixelAt } = require('./helpers');
const { unpackRGB } = require('../src/core/color');

describe('framebuffer colour order', () => {
  // solid.nes fills the screen with NES colour $16, a red. If the packed
  // framebuffer word is ever unpacked in the wrong byte order this renders
  // blue instead, so this test is the guard on src/core/color.js.
  test('a known red renders as red, not blue', () => {
    const emulator = boot('solid.nes');
    const [r, g, b] = pixelAt(emulator, 128, 120);

    expect(r).toBeGreaterThan(150);
    expect(b).toBeLessThan(60);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeLessThan(r);
  });

  test('unpackRGB reads red from the low byte', () => {
    expect(unpackRGB(0x0000ff)).toEqual([255, 0, 0]);
    expect(unpackRGB(0xff0000)).toEqual([0, 0, 255]);
    expect(unpackRGB(0x00ff00)).toEqual([0, 255, 0]);
  });
});
