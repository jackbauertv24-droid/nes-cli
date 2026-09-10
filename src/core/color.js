/**
 * Framebuffer colour unpacking.
 *
 * jsnes packs each pixel as a 24-bit integer in the order 0x00BBGGRR - red is
 * the *low* byte, not the high one. This is easy to get backwards: the field
 * accessors inside jsnes's own PaletteTable are named getRed/getGreen/getBlue
 * but read the bytes in the opposite order, and only stay self-consistent
 * because makeTables() packs them back the same way. The authoritative signal
 * is jsnes's debug code in ppu.js, which labels 0x0000ff as red, and its
 * canvas path, which ORs the packed value straight into a little-endian RGBA
 * word.
 *
 * Every conversion out of the framebuffer or the palette table goes through
 * here so the convention is stated once. test/palette.test.js pins it against
 * a fixture ROM that renders a known red.
 */

/** @returns {[number, number, number]} r, g, b in 0-255. */
function unpackRGB(packed) {
  return [packed & 0xff, (packed >> 8) & 0xff, (packed >> 16) & 0xff];
}

module.exports = { unpackRGB };
