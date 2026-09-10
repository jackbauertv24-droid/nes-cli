#!/usr/bin/env node
/**
 * Regenerates examples/ from a Super Mario Bros. 3 ROM.
 *
 * The ROM is not in this repository and never should be. Pass a path to your
 * own copy:
 *
 *   node tools/make-examples.js /path/to/smb3.nes
 *
 * The input sequence below navigates the World 1 map to level 1-1 and plays a
 * little way into it, so the examples show real gameplay rather than the title
 * screen. Frame counts are generous on purpose: they are waiting out fades and
 * map animations, and being early is what breaks the sequence.
 */

const path = require('path');
const fs = require('fs');
const Emulator = require('../src/core/emulator');
const PNGHandler = require('../src/formats/image/png');
const ASCIIHandler = require('../src/formats/image/ascii');
const RecordCommand = require('../src/commands/record');
const AudioCommand = require('../src/commands/audio');
const SpritesCommand = require('../src/commands/sprites');

const romPath = process.argv[2];
if (!romPath || !fs.existsSync(romPath)) {
  console.error('Usage: node tools/make-examples.js <path to smb3.nes>');
  process.exit(1);
}

const OUT = path.join(__dirname, '..', 'examples');
fs.mkdirSync(OUT, { recursive: true });
const out = (name) => path.join(OUT, name);

const emulator = new Emulator();
emulator.loadROM(romPath);

function press(button, holdFrames = 8, settleFrames = 90) {
  emulator.buttonDown(1, button);
  emulator.run(holdFrames);
  emulator.buttonUp(1, button);
  emulator.run(settleFrames);
}

// Boot into the attract screen, then through the menu onto the World 1 map.
emulator.run(300);
PNGHandler.save(emulator.getFrameBuffer(), out('smb3_title.png'));

press('START', 8, 200); // attract -> 1/2 player menu
press('START', 8, 600); // menu -> world map
PNGHandler.save(emulator.getFrameBuffer(), out('smb3_map.png'));

// Mario starts on the START panel, below the path. Right, then up, puts him on
// level 1-1; A enters it.
press('RIGHT', 18, 120);
press('UP', 18, 120);
press('A', 10, 400);

// Walk in a little way so the frame has Mario, blocks and an enemy in it.
emulator.buttonDown(1, 'RIGHT');
emulator.run(75);
emulator.buttonUp(1, 'RIGHT');
emulator.run(30);

PNGHandler.save(emulator.getFrameBuffer(), out('smb3_gameplay.png'));
ASCIIHandler.saveASCII(emulator.getFrameBuffer(), out('smb3_gameplay.txt'), { scale: 0.5 });
console.log('screenshots written');

// Sprites, from the live pattern tables at each sprite's own scanline.
new SpritesCommand(emulator).execute({
  format: 'oam',
  outputDir: out('sprites'),
  individual: true
});

// SMB3 re-banks CHR partway down the frame to give its status bar different
// tiles, so say which part of the screen we want: row 100 is the playfield.
new SpritesCommand(emulator).execute({
  format: 'chr',
  outputDir: out('sprites'),
  atRow: 100
});

// Recording and metasprite analysis both advance the emulator, so they come
// last and each gets its own stretch of gameplay.
emulator.buttonDown(1, 'RIGHT');
new SpritesCommand(emulator).execute({
  format: 'metasprite',
  outputDir: out('sprites'),
  frames: 150
});
emulator.buttonUp(1, 'RIGHT');
emulator.run(60);

new RecordCommand(emulator).execute({
  format: 'gif',
  duration: '4s',
  fps: 20,
  output: out('smb3_gameplay.gif')
});

new AudioCommand(emulator).execute({
  duration: '5s',
  output: out('smb3_gameplay.wav')
});

console.log('examples regenerated');
