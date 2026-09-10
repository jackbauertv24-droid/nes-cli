#!/usr/bin/env node
/**
 * Regenerates examples-smb1/ from a Super Mario Bros. ROM.
 *
 *   node tools/make-smb1-examples.js /path/to/smb1.nes
 *
 * No input at all. Left alone the game alternates between its title screen and
 * a demo that plays World 1-1, and the demo is real gameplay - Mario walking,
 * jumping, and eventually dying. Boundaries measured rather than guessed: the
 * title paints a brown panel across the middle of the screen and the demo does
 * not, so a single pixel tells them apart.
 *
 *   frames   33- 542   title screen
 *   frames  543-1320   demo of World 1-1
 *   frames 1321-1824   title again, then it repeats
 *
 * This is the only cartridge here with **8x8 sprites** - the other three are all
 * 8x16 - so Mario is four hardware sprites in a 16x16 box rather than two in a
 * 16x32 one. It is also NROM with fixed CHR-ROM, so tile data never moves at
 * all: no bank switching, no $2007 writes.
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
  console.error('Usage: node tools/make-smb1-examples.js <path to smb1.nes>');
  process.exit(1);
}

const DEMO_START = 543;
const DEMO_END = 1320;
// The status bar occupies the top few rows; the playfield is below it.
const PLAYFIELD_TOP = 40;

const OUT = path.join(__dirname, '..', 'examples-smb1');
fs.mkdirSync(OUT, { recursive: true });
const out = (name) => path.join(OUT, name);

function fresh(atFrame) {
  const emulator = new Emulator();
  emulator.loadROM(romPath);
  emulator.run(atFrame);
  return emulator;
}

PNGHandler.save(fresh(200).getFrameBuffer(), out('smb1_title.png'));

const play = fresh(700);
PNGHandler.save(play.getFrameBuffer(), out('smb1_gameplay.png'));
ASCIIHandler.saveASCII(play.getFrameBuffer(), out('smb1_gameplay.txt'), { scale: 0.5 });
console.log('screenshots written');

new SpritesCommand(play).execute({
  format: 'oam',
  outputDir: out('sprites'),
  individual: true
});
// NROM never rebanks, so the pattern tables are the same at any row.
new SpritesCommand(play).execute({
  format: 'chr',
  outputDir: out('sprites')
});

new SpritesCommand(fresh(DEMO_START + 8)).execute({
  format: 'metasprite',
  outputDir: out('sprites'),
  frames: DEMO_END - DEMO_START - 16,
  minY: PLAYFIELD_TOP,
  byPalette: true,
  preview: true
});

new SpritesCommand(fresh(DEMO_START + 8)).execute({
  format: 'animation',
  outputDir: out('sprites'),
  frames: DEMO_END - DEMO_START - 16,
  minY: PLAYFIELD_TOP
});

new RecordCommand(fresh(600)).execute({
  format: 'gif',
  duration: '5s',
  fps: 20,
  output: out('smb1_gameplay.gif')
});

new AudioCommand(fresh(600)).execute({
  duration: '6s',
  output: out('smb1_gameplay.wav')
});

console.log('SMB1 examples regenerated');
