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

describe('cluster size bound', () => {
  test('a chain of sprites spanning the screen is rejected', () => {
    // Proximity grouping is transitive, so an evenly spaced row of sprites
    // chains into one cluster. Without a bound this was written out as a
    // screen-tall smear rather than discarded.
    const emulator = boot('metasprite.nes', 30);
    const analyzer = new MetaspriteAnalyzer(emulator);

    const line = [];
    for (let i = 0; i < 20; i++) {
      line.push({ id: i, x: 8 + i * 8, screenY: 100, tile: 0x05, palette: 1, flipHorizontal: 0, flipVertical: 0 });
    }
    const clustered = analyzer.clusterSpritesByPosition(line, 8, 16);
    expect(clustered).toHaveLength(1);

    const bounds = analyzer.getClusterBounds(clustered[0], 16);
    expect(bounds.width).toBeGreaterThan(analyzer.maxSize.width);
  });

  test('the real character is still inside the bound', () => {
    const emulator = boot('metasprite.nes', 30);
    const analyzer = new MetaspriteAnalyzer(emulator);
    const found = analyzer.analyzeMetasprites(10);

    expect(found).toHaveLength(1);
    expect(found[0].width).toBeLessThanOrEqual(analyzer.maxSize.width);
    expect(found[0].height).toBeLessThanOrEqual(analyzer.maxSize.height);
  });

  test('the bound can be raised for a large boss sprite', () => {
    const emulator = boot('metasprite.nes', 30);
    expect(new MetaspriteAnalyzer(emulator, { maxWidth: 8, maxHeight: 8 }).analyzeMetasprites(10)).toHaveLength(0);
    expect(new MetaspriteAnalyzer(emulator, { maxWidth: 128, maxHeight: 128 }).analyzeMetasprites(10)).toHaveLength(1);
  });
});

describe('degenerate clusters', () => {
  test('a pile of parked sprites at one position is rejected', () => {
    // Games hide unused sprites by parking them, frequently all at the same
    // coordinates. They stack into a cluster of dozens occupying a single
    // tile, which used to be written out as a small black rectangle.
    const emulator = boot('metasprite.nes', 30);
    const analyzer = new MetaspriteAnalyzer(emulator);

    const pile = [];
    for (let i = 0; i < 40; i++) {
      pile.push({ id: i, x: 0, screenY: 200, tile: 0x05, palette: 1, flipHorizontal: 0, flipVertical: 0 });
    }

    const [cluster] = analyzer.clusterSpritesByPosition(pile, 8, 16);
    expect(cluster).toHaveLength(40);

    const bounds = analyzer.getClusterBounds(cluster, 16);
    // Small enough to pass the size bound, so the sprite-count bound is what
    // has to catch it.
    expect(bounds.width).toBeLessThanOrEqual(analyzer.maxSize.width);
    expect(cluster.length).toBeGreaterThan(analyzer.maxSprites);
  });

  test('the four-sprite character is well inside the sprite-count bound', () => {
    const emulator = boot('metasprite.nes', 30);
    const analyzer = new MetaspriteAnalyzer(emulator);
    const found = analyzer.analyzeMetasprites(10);
    expect(found[0].spriteCount).toBeLessThanOrEqual(analyzer.maxSprites);
  });
});

describe('sprite sheets', () => {
  const { PNG } = require('pngjs');

  function fakePose(width, height, colour) {
    const png = new PNG({ width, height });
    png.data.fill(0);
    for (let i = 0; i < width * height; i++) {
      png.data[i * 4] = colour;
      png.data[i * 4 + 3] = 255;
    }
    return { width, height, png, palette: 0 };
  }

  test('poses are tiled into uniform cells on a transparent background', () => {
    const dir = tmpdir('sheet');
    const file = path.join(dir, 'sheet.png');

    const result = MetaspriteAnalyzer.saveSheet(
      [fakePose(16, 32, 10), fakePose(16, 32, 20), fakePose(8, 16, 30)],
      file,
      8
    );

    expect(result).toMatchObject({ cellWidth: 16, cellHeight: 32, columns: 3, rows: 1 });

    const png = PNG.sync.read(fs.readFileSync(file));
    expect(png.width).toBe(48);
    expect(png.height).toBe(32);
    // The gap left by the third, smaller pose stays transparent: a sheet is an
    // asset, not a preview, so it gets no matte.
    expect(png.data[(0 * png.width + 34) * 4 + 3]).toBe(0);
  });

  test('a short pose sits on the bottom of its cell so feet line up', () => {
    const dir = tmpdir('sheet-align');
    const file = path.join(dir, 'sheet.png');

    MetaspriteAnalyzer.saveSheet([fakePose(16, 32, 10), fakePose(16, 16, 20)], file, 8);

    const png = PNG.sync.read(fs.readFileSync(file));
    const alphaAt = (x, y) => png.data[(y * png.width + x) * 4 + 3];

    // Second cell starts at x=16. Its top half is empty, its bottom half drawn.
    expect(alphaAt(20, 4)).toBe(0);
    expect(alphaAt(20, 31)).toBe(255);
    // The full-height pose reaches the top of its own cell.
    expect(alphaAt(4, 0)).toBe(255);
  });

  test('wrapping onto several rows respects the column count', () => {
    const dir = tmpdir('sheet-wrap');
    const file = path.join(dir, 'sheet.png');
    const poses = Array.from({ length: 5 }, () => fakePose(8, 8, 40));

    const result = MetaspriteAnalyzer.saveSheet(poses, file, 2);
    expect(result).toMatchObject({ columns: 2, rows: 3 });

    const png = PNG.sync.read(fs.readFileSync(file));
    expect(png.width).toBe(16);
    expect(png.height).toBe(24);
  });

  test('an empty set writes nothing rather than a zero-sized PNG', () => {
    const dir = tmpdir('sheet-empty');
    expect(MetaspriteAnalyzer.saveSheet([], path.join(dir, 'sheet.png'))).toBeNull();
  });

  test('each metasprite records the palette it was drawn with', () => {
    const emulator = boot('metasprite.nes', 30);
    const outDir = tmpdir('sheet-palette');

    new SpritesCommand(emulator).execute({
      format: 'metasprite',
      outputDir: outDir,
      frames: 10,
      byPalette: true
    });

    const meta = JSON.parse(
      fs.readFileSync(path.join(outDir, 'metasprites', 'metasprites.json'), 'utf8')
    );
    // The fixture's character is drawn with sprite palette 1.
    expect(meta[0].palette).toBe(1);

    expect(fs.existsSync(path.join(outDir, 'metasprites', 'sheet.png'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'metasprites', 'sheet-palette1.png'))).toBe(true);
    // Nothing on palette 0 was found, so no sheet for it.
    expect(fs.existsSync(path.join(outDir, 'metasprites', 'sheet-palette0.png'))).toBe(false);
  });
});
