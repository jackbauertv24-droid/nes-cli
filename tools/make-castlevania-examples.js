#!/usr/bin/env node
/**
 * Regenerates examples-castlevania/ from a Castlevania (USA) ROM.
 *
 *   node tools/make-castlevania-examples.js /path/to/castlevania.nes
 *
 * No buttons are pressed at any point. Left alone, Castlevania cycles between
 * its title screen and a playable demo of Stage 12, and the demo is where
 * everything interesting is. Frame numbers below come from measuring that
 * cycle rather than guessing: the HUD sprite on screen row 23 exists only
 * during the demo, so watching for it gives exact boundaries.
 *
 *   frames    1- 702   title screen
 *   frames  703-2096   demo: Simon walking, whipping, enemies, items
 *   frames 2097-2783   title screen again, then the cycle repeats
 *
 * The cartridge is UNROM with CHR-RAM, so none of its tile data is in the ROM
 * file - it is written into PPU memory as the game runs, and rewritten in place
 * to animate. See TECHNICAL_FINDINGS.md.
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
  console.error('Usage: node tools/make-castlevania-examples.js <path to castlevania.nes>');
  process.exit(1);
}

const DEMO_START = 703;
const DEMO_END = 2096;
// The status bar's sprites sit above row 56; everything below is the playfield.
const PLAYFIELD_TOP = 56;

const OUT = path.join(__dirname, '..', 'examples-castlevania');
fs.mkdirSync(OUT, { recursive: true });
const out = (name) => path.join(OUT, name);

function fresh(atFrame) {
  const emulator = new Emulator();
  emulator.loadROM(romPath);
  emulator.run(atFrame);
  return emulator;
}

// Title screen, and three moments from the demo.
PNGHandler.save(fresh(400).getFrameBuffer(), out('cv_title.png'));

const play = fresh(1200);
PNGHandler.save(play.getFrameBuffer(), out('cv_gameplay.png'));
ASCIIHandler.saveASCII(play.getFrameBuffer(), out('cv_gameplay.txt'), { scale: 0.5 });

PNGHandler.save(fresh(1600).getFrameBuffer(), out('cv_whip.png'));
console.log('screenshots written');

// Sprites as they stand mid-demo.
const still = fresh(1600);
new SpritesCommand(still).execute({
  format: 'oam',
  outputDir: out('sprites'),
  individual: true
});
new SpritesCommand(still).execute({
  format: 'chr',
  outputDir: out('sprites'),
  atRow: 120
});

// Poses across the whole demo. Simon is palette 0; --by-palette separates him
// from the enemies and from his own whip, which is drawn in palette 1.
const poses = fresh(DEMO_START + 8);
new SpritesCommand(poses).execute({
  format: 'metasprite',
  outputDir: out('sprites'),
  frames: DEMO_END - DEMO_START - 16,
  minY: PLAYFIELD_TOP,
  byPalette: true
});

// Animation clips over the same stretch. Tracking has to cope with Castlevania
// rotating every character through fresh OAM slots each frame.
const clips = fresh(DEMO_START + 8);
new SpritesCommand(clips).execute({
  format: 'animation',
  outputDir: out('sprites'),
  frames: DEMO_END - DEMO_START - 16,
  minY: PLAYFIELD_TOP
});

// A recording and some audio from the middle of the demo.
const media = fresh(1100);
new RecordCommand(media).execute({
  format: 'gif',
  duration: '5s',
  fps: 20,
  output: out('cv_gameplay.gif')
});
new AudioCommand(fresh(1100)).execute({
  duration: '6s',
  output: out('cv_gameplay.wav')
});

console.log('Castlevania examples regenerated');
