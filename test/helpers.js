const path = require('path');
const os = require('os');
const fs = require('fs');
const Emulator = require('../src/core/emulator');

const FIXTURES = path.join(__dirname, 'fixtures');

function fixture(name) {
  return path.join(FIXTURES, name);
}

/** Load a fixture ROM and advance it far enough to have rendered a screen. */
function boot(name, frames = 30) {
  const emulator = new Emulator();
  emulator.loadROM(fixture(name));
  emulator.run(frames);
  return emulator;
}

/** Colour of one framebuffer pixel as [r, g, b]. */
function pixelAt(emulator, x, y) {
  const { unpackRGB } = require('../src/core/color');
  return unpackRGB(emulator.getFrameBuffer()[y * 256 + x]);
}

function tmpdir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `nes-cli-${label}-`));
}

module.exports = { fixture, boot, pixelAt, tmpdir, FIXTURES };
