#!/usr/bin/env node
/**
 * Regenerates examples-zelda/ from a Legend of Zelda ROM.
 *
 *   node tools/make-zelda-examples.js /path/to/zelda.nes
 *
 * Unlike the other two games, Zelda has no gameplay demo to sit and watch. Its
 * attract loop is the story text and a catalogue of items, so Link has to be
 * played to - and the game will not start until a save file exists. The
 * sequence below registers one, which is fiddly enough to be worth writing down:
 *
 *   START                 title -> file select, cursor on REGISTER YOUR NAME
 *   START                 -> the name entry screen
 *   A                     types one letter; the D-pad moves around the letter
 *                         grid, and A picks the letter under it
 *   SELECT x3             moves the heart cursor down past the three file rows
 *                         to the REGISTER line - SELECT moves it, not the
 *                         D-pad, which is driving the letter grid
 *   START                 registers, back to file select
 *   START                 begins the game on file 1
 *
 * Extraction then holds a direction so Link walks while frames are analysed;
 * an extraction with no input would record him standing still. Each direction
 * is captured separately, which is also the more useful output: four clean
 * directional walk cycles rather than one clip that changes facing partway.
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
  console.error('Usage: node tools/make-zelda-examples.js <path to zelda.nes>');
  process.exit(1);
}

const OUT = path.join(__dirname, '..', 'examples-zelda');
fs.mkdirSync(OUT, { recursive: true });
const out = (name) => path.join(OUT, name);

// The status bar occupies the top of the screen; the map is below it.
const PLAYFIELD_TOP = 64;

function press(emulator, button, holdFrames = 6, settleFrames = 30) {
  emulator.buttonDown(1, button);
  emulator.run(holdFrames);
  emulator.buttonUp(1, button);
  emulator.run(settleFrames);
}

/** Boot, register a save file, and start the game. */
function startedGame() {
  const emulator = new Emulator();
  emulator.loadROM(romPath);

  emulator.run(300); // title screen
  press(emulator, 'START', 6, 60); // -> file select
  emulator.run(60);
  press(emulator, 'START', 6, 60); // -> name entry

  press(emulator, 'A', 6, 30); // one letter is a valid name
  press(emulator, 'SELECT', 6, 25);
  press(emulator, 'SELECT', 6, 25);
  press(emulator, 'SELECT', 6, 25); // heart now on REGISTER
  press(emulator, 'START', 6, 120); // -> back at file select

  press(emulator, 'START', 6, 180); // -> in the game
  emulator.run(120);

  return emulator;
}

const game = startedGame();
PNGHandler.save(game.getFrameBuffer(), out('zelda_start.png'));
ASCIIHandler.saveASCII(game.getFrameBuffer(), out('zelda_start.txt'), { scale: 0.5 });

// The screens the sequence passes through, for anyone retracing it.
const titleShot = new Emulator();
titleShot.loadROM(romPath);
titleShot.run(300);
PNGHandler.save(titleShot.getFrameBuffer(), out('zelda_title.png'));

console.log('screenshots written');

new SpritesCommand(game).execute({
  format: 'oam',
  outputDir: out('sprites'),
  individual: true
});
new SpritesCommand(game).execute({
  format: 'chr',
  outputDir: out('sprites'),
  atRow: 120
});

// One walk cycle per facing. Each starts from a freshly started game so the
// clips do not depend on where the previous direction left Link standing.
for (const direction of ['DOWN', 'UP', 'LEFT', 'RIGHT']) {
  const walker = startedGame();
  new SpritesCommand(walker).execute({
    format: 'animation',
    outputDir: out(`walk-${direction.toLowerCase()}`),
    frames: 150,
    minY: PLAYFIELD_TOP,
    hold: [direction]
  });
}

// Every pose Link takes across all four directions, on one sheet.
const poses = startedGame();
for (const direction of ['DOWN', 'UP', 'LEFT', 'RIGHT']) {
  new SpritesCommand(poses).execute({
    format: 'metasprite',
    outputDir: out(`poses-${direction.toLowerCase()}`),
    frames: 100,
    minY: PLAYFIELD_TOP,
    hold: [direction],
    preview: true
  });
}

const media = startedGame();
media.buttonDown(1, 'RIGHT');
new RecordCommand(media).execute({
  format: 'gif',
  duration: '4s',
  fps: 20,
  output: out('zelda_walk.gif')
});
media.buttonUp(1, 'RIGHT');

new AudioCommand(startedGame()).execute({
  duration: '6s',
  output: out('zelda_overworld.wav')
});

console.log('Zelda examples regenerated');
