const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { boot, tmpdir, fixture } = require('./helpers');
const SpriteHandler = require('../src/formats/image/spritesheet');
const SpritesCommand = require('../src/commands/sprites');

// sprites.nes draws two 8x16 sprites from pattern table 1, tiles 4 and 5, over
// a light blue ($21) background. Tile 4's top row is 0,0,1,1,1,1,0,0.
const TOP_ROW = [0, 0, 1, 1, 1, 1, 0, 0];
const BACKGROUND = [60, 171, 255]; // NES $21

describe('sprite extraction', () => {
  let emulator;

  beforeAll(() => {
    emulator = boot('sprites.nes', 60);
  });

  test('the fixture is in 8x16 mode', () => {
    expect(emulator.is8x16Sprites()).toBe(true);
  });

  test('OAM decodes position, tile and attributes', () => {
    const [sprite] = SpriteHandler.extractOAM(emulator);

    expect(sprite.x).toBe(64);
    // OAM holds 99; the PPU draws it one row lower.
    expect(sprite.y).toBe(99);
    expect(sprite.screenY).toBe(100);
    expect(sprite.tile).toBe(0x05);
    expect(sprite.palette).toBe(1);
    expect(sprite.visible).toBe(true);
  });

  test('bit 0 of the tile byte selects the pattern table in 8x16 mode', () => {
    // Tile byte $05 means table 1, tiles 4 and 5 - not tile 5 of table 0.
    expect(emulator.resolveSpriteTiles(0x05)).toEqual({ table: 1, tiles: [4, 5] });
    expect(emulator.resolveSpriteTiles(0x04)).toEqual({ table: 0, tiles: [4, 5] });
  });

  test('pattern tiles are read from live PPU memory', () => {
    const tile = emulator.getPatternTile(1, 4);
    expect(tile.slice(0, 8)).toEqual(TOP_ROW);
    // Table 0 is blank in this fixture, which proves the table argument is used.
    expect(emulator.getPatternTile(0, 4).every((p) => p === 0)).toBe(true);
  });

  test('a sprite bitmap is 8x16 and keeps its transparent corners', () => {
    const [sprite] = SpriteHandler.extractOAM(emulator);
    const { pixels, width, height } = SpriteHandler.getSpritePixels(emulator, sprite);

    expect(width).toBe(8);
    expect(height).toBe(16);
    expect(pixels.length).toBe(128);
    expect(pixels[0]).toBe(0); // top-left corner is transparent
    expect(pixels[3]).toBe(1);
    expect(pixels[8 * 2 + 3]).toBe(3); // interior is colour index 3
  });

  test('the two sprites resolve to different palettes', () => {
    const [first, second] = SpriteHandler.extractOAM(emulator);
    const a = emulator.getSpritePalette(first.palette);
    const b = emulator.getSpritePalette(second.palette);
    expect(a[1]).not.toEqual(b[1]);
  });

  describe('written PNGs', () => {
    let outDir;

    beforeAll(() => {
      outDir = tmpdir('sprites');
      new SpritesCommand(emulator).execute({
        format: 'oam',
        outputDir: outDir,
        individual: true
      });
    });

    test('an individual sprite is transparent where the tile is index 0', () => {
      const png = PNG.sync.read(fs.readFileSync(path.join(outDir, 'oam', 'sprite_00.png')));

      expect(png.width).toBe(8);
      expect(png.height).toBe(16);
      expect(png.data[3]).toBe(0); // corner alpha
      expect(png.data[(2 * 8 + 3) * 4 + 3]).toBe(255); // interior alpha
    });

    test('no background colour bleeds into an extracted sprite', () => {
      // Compositing from pattern indices rather than scraping the framebuffer
      // is what guarantees this: the sky behind the sprite is never sampled.
      const png = PNG.sync.read(fs.readFileSync(path.join(outDir, 'oam', 'sprite_00.png')));

      for (let i = 0; i < png.width * png.height; i++) {
        const [r, g, b, a] = png.data.slice(i * 4, i * 4 + 4);
        if (a === 0) continue;
        expect([r, g, b]).not.toEqual(BACKGROUND);
      }
    });

    test('the spritesheet gives 8x16 sprites full-height cells', () => {
      const png = PNG.sync.read(fs.readFileSync(path.join(outDir, 'oam', 'spritesheet.png')));
      // Two visible sprites, 16 per row, 16px tall cells.
      expect(png.height).toBe(16);
      expect(png.width).toBe(16 * 8);
    });

    test('oam.json records every sprite without pixel payloads', () => {
      const meta = JSON.parse(fs.readFileSync(path.join(outDir, 'oam', 'oam.json'), 'utf8'));
      expect(meta).toHaveLength(64);
      expect(meta[0]).toMatchObject({ x: 64, screenY: 100, tile: 5, palette: 1 });
      expect(meta[0].renderedPixels).toBeUndefined();
    });
  });
});

describe('driving a character during extraction', () => {
  const Emulator = require('../src/core/emulator');

  test('held buttons reach the game while frames are analysed', () => {
    // Games without an attract-mode demo have to be driven, and both metasprite
    // and animation extraction advance the emulator themselves. Without --hold
    // the character stands still for every frame analysed.
    const emulator = new Emulator();
    emulator.loadROM(fixture('input.nes'));
    emulator.run(30);

    const command = new SpritesCommand(emulator);
    const seen = [];

    command.withHeldButtons(['START'], () => {
      for (let i = 0; i < 5; i++) {
        emulator.run(1);
        seen.push(emulator.getNES().cpu.mem[0x10]);
      }
    });

    // input.nes latches the controller into $0010; bit 4 is Start.
    expect(seen.some((v) => v & 0x10)).toBe(true);
  });

  test('buttons are released afterwards, even if extraction throws', () => {
    const emulator = new Emulator();
    emulator.loadROM(fixture('input.nes'));
    emulator.run(30);

    const command = new SpritesCommand(emulator);
    expect(() =>
      command.withHeldButtons(['A'], () => {
        throw new Error('boom');
      })
    ).toThrow('boom');

    emulator.run(3);
    expect(emulator.getNES().cpu.mem[0x10] & 0x80).toBe(0);
  });

  test('an unknown button is rejected before anything runs', () => {
    const emulator = new Emulator();
    emulator.loadROM(fixture('input.nes'));
    const command = new SpritesCommand(emulator);
    expect(() => command.withHeldButtons(['TURBO'], () => {})).toThrow(/Unknown button/);
  });
});
