const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { boot, tmpdir } = require('./helpers');
const MetaspriteAnalyzer = require('../src/formats/image/metasprite');
const SpritesCommand = require('../src/commands/sprites');

// metasprite.nes draws a 16x32 character from four 8x16 sprites at (64,100),
// plus one lone HUD sprite at (200,16) on palette 2.
const BACKGROUND = [60, 171, 255]; // NES $21

describe('metasprite grouping', () => {
  test('four adjacent sprites are recognised as one 16x32 character', () => {
    const emulator = boot('metasprite.nes', 30);
    const found = new MetaspriteAnalyzer(emulator).analyzeMetasprites(10);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ width: 16, height: 32, spriteCount: 4 });
    // The character is stationary, so it recurs on every analysed frame.
    expect(found[0].occurrences).toBe(10);
  });

  test('the lone HUD sprite is not a metasprite on its own', () => {
    const emulator = boot('metasprite.nes', 30);
    // Restricting to the HUD row leaves a single sprite, below minSprites.
    const analyzer = new MetaspriteAnalyzer(emulator, { maxY: 40 });
    expect(analyzer.analyzeMetasprites(10)).toHaveLength(0);
  });

  test('the palette filter selects which sprites are considered', () => {
    const emulator = boot('metasprite.nes', 30);
    // The character is palette 1; palette 2 is only the HUD sprite.
    expect(new MetaspriteAnalyzer(emulator, { palettes: [2] }).analyzeMetasprites(10)).toHaveLength(0);
    expect(new MetaspriteAnalyzer(emulator, { palettes: [1] }).analyzeMetasprites(10)).toHaveLength(1);
  });

  test('a rendered metasprite is transparent outside the character', () => {
    const emulator = boot('metasprite.nes', 30);
    const outDir = tmpdir('meta');

    new SpritesCommand(emulator).execute({ format: 'metasprite', outputDir: outDir, frames: 10 });

    const file = path.join(outDir, 'metasprites', 'metasprite_000.png');
    const png = PNG.sync.read(fs.readFileSync(file));

    expect(png.width).toBe(16);
    expect(png.height).toBe(32);

    // Corners come from colour index 0 on all four member sprites.
    expect(png.data[3]).toBe(0);
    expect(png.data[(15) * 4 + 3]).toBe(0);

    let opaque = 0;
    for (let i = 0; i < png.width * png.height; i++) {
      const [r, g, b, a] = png.data.slice(i * 4, i * 4 + 4);
      if (a === 0) continue;
      opaque += 1;
      // Compositing from pattern indices means the sky is never sampled.
      expect([r, g, b]).not.toEqual(BACKGROUND);
    }
    expect(opaque).toBeGreaterThan(300);
  });

  test('metasprites.json describes what was written', () => {
    const emulator = boot('metasprite.nes', 30);
    const outDir = tmpdir('meta-json');

    new SpritesCommand(emulator).execute({ format: 'metasprite', outputDir: outDir, frames: 10 });

    const meta = JSON.parse(
      fs.readFileSync(path.join(outDir, 'metasprites', 'metasprites.json'), 'utf8')
    );
    expect(meta).toHaveLength(1);
    expect(meta[0]).toMatchObject({ width: 16, height: 32, spriteCount: 4 });
  });
});
