#!/usr/bin/env node
/**
 * Regenerates examples/ from a Super Mario Bros. 3 ROM.
 *
 * The ROM is not in this repository and never should be. Pass a path to your
 * own copy:
 *
 *   node tools/make-examples.js /path/to/smb3.nes
 *
 * Two captures are made. The first touches no buttons at all: left alone, SMB3
 * runs a demo over its title screen where Mario and Luigi jump around, which is
 * the richest source of character sprites in the game. The second navigates the
 * World 1 map to level 1-1 and plays a little way in. Frame counts are generous on purpose: they are waiting out fades and
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
const { PNG } = require('pngjs');

const romPath = process.argv[2];
if (!romPath || !fs.existsSync(romPath)) {
  console.error('Usage: node tools/make-examples.js <path to smb3.nes>');
  process.exit(1);
}

/**
 * Tile every extracted metasprite onto one checkerboard sheet, scaled up.
 * The checkerboard is there so transparency is visible rather than implied.
 */
function contactSheet(dir, scale = 3, pad = 6) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metasprites.json'), 'utf8'));
  if (meta.length === 0) return null;

  const images = meta.map((m) => PNG.sync.read(fs.readFileSync(path.join(dir, m.filename))));
  const width = images.reduce((total, img) => total + img.width * scale + pad, pad);
  const height = Math.max(...images.map((img) => img.height)) * scale + pad * 2;
  const sheet = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = ((x >> 3) + (y >> 3)) % 2 ? 215 : 180;
      const i = (y * width + x) * 4;
      sheet.data[i] = shade;
      sheet.data[i + 1] = shade;
      sheet.data[i + 2] = shade;
      sheet.data[i + 3] = 255;
    }
  }

  let originX = pad;
  for (const img of images) {
    for (let y = 0; y < img.height * scale; y++) {
      for (let x = 0; x < img.width * scale; x++) {
        const src = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
        if (img.data[src + 3] === 0) continue;
        const dst = ((y + pad) * width + originX + x) * 4;
        sheet.data[dst] = img.data[src];
        sheet.data[dst + 1] = img.data[src + 1];
        sheet.data[dst + 2] = img.data[src + 2];
        sheet.data[dst + 3] = 255;
      }
    }
    originX += img.width * scale + pad;
  }

  const outPath = path.join(dir, '..', 'contact-sheet.png');
  fs.writeFileSync(outPath, PNG.sync.write(sheet));
  return outPath;
}

const OUT = path.join(__dirname, '..', 'examples');
fs.mkdirSync(OUT, { recursive: true });
const out = (name) => path.join(OUT, name);

function press(emulator, button, holdFrames = 8, settleFrames = 90) {
  emulator.buttonDown(1, button);
  emulator.run(holdFrames);
  emulator.buttonUp(1, button);
  emulator.run(settleFrames);
}

// ---------------------------------------------------------------------------
// Title demo. Press nothing; the game animates Mario and Luigi by itself.
// ---------------------------------------------------------------------------

const demo = new Emulator();
demo.loadROM(romPath);

// The pair walk on around frame 120 and are jumping by 250. Analysing from 60
// covers the whole routine including the items that follow.
demo.run(60);
PNGHandler.save(demo.getFrameBuffer(), out('smb3_title.png'));

new SpritesCommand(demo).execute({
  format: 'metasprite',
  outputDir: out('sprites-title-demo'),
  frames: 340
});

// A frame from the middle of the routine, with a character mid-jump. This uses
// a second emulator because the metasprite analysis above has already run the
// first one past this point.
const demoFrame = new Emulator();
demoFrame.loadROM(romPath);
demoFrame.run(250);
PNGHandler.save(demoFrame.getFrameBuffer(), out('smb3_title_demo.png'));

contactSheet(out('sprites-title-demo/metasprites'));
console.log('title demo captured');

// ---------------------------------------------------------------------------
// Gameplay.
// ---------------------------------------------------------------------------

const emulator = new Emulator();
emulator.loadROM(romPath);

// Boot, then through the menu onto the World 1 map.
emulator.run(300);
press(emulator, 'START', 8, 200); // attract -> 1/2 player menu
press(emulator, 'START', 8, 600); // menu -> world map
PNGHandler.save(emulator.getFrameBuffer(), out('smb3_map.png'));

// Mario starts on the START panel, below the path. Right, then up, puts him on
// level 1-1; A enters it.
press(emulator, 'RIGHT', 18, 120);
press(emulator, 'UP', 18, 120);
press(emulator, 'A', 10, 400);

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

contactSheet(out('sprites/metasprites'));

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
