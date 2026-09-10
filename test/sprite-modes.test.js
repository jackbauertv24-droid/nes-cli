const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { boot, tmpdir } = require('./helpers');
const SpriteHandler = require('../src/formats/image/spritesheet');
const SpritesCommand = require('../src/commands/sprites');

/**
 * sprites8x8.nes runs in 8x8 mode with PPUCTRL bit 3 set, so its sprites come
 * from pattern table 1, and draws one asymmetric corner tile four times: plain,
 * flipped horizontally, vertically, and both.
 *
 * Neither commercial cartridge this project has been tested against uses 8x8
 * sprites - both SMB3 and Castlevania are 8x16 throughout - so without this
 * fixture the whole 8x8 branch goes unexercised.
 */
describe('8x8 sprite mode', () => {
  let emulator;

  beforeAll(() => {
    emulator = boot('sprites8x8.nes', 40);
  });

  test('the fixture is in 8x8 mode', () => {
    expect(emulator.is8x16Sprites()).toBe(false);
  });

  test('the pattern table comes from PPUCTRL, not from the tile byte', () => {
    // In 8x16 mode bit 0 of the tile byte selects the table. In 8x8 mode the
    // tile byte is the whole index and PPUCTRL bit 3 chooses.
    expect(emulator.getSpritePatternTable()).toBe(1);
    expect(emulator.resolveSpriteTiles(4)).toEqual({ table: 1, tiles: [4] });
    // Even tile byte, which in 8x16 mode would have meant table 0.
    expect(emulator.resolveSpriteTiles(6)).toEqual({ table: 1, tiles: [6] });
  });

  test('sprites are eight pixels tall, not sixteen', () => {
    const [sprite] = SpriteHandler.extractOAM(emulator);
    const { pixels, width, height } = SpriteHandler.getSpritePixels(emulator, sprite);

    expect(width).toBe(8);
    expect(height).toBe(8);
    expect(pixels).toHaveLength(64);
  });

  test('the art is found, so table 1 really was read', () => {
    // Table 0 is blank in this fixture; reading it would give empty sprites.
    const [sprite] = SpriteHandler.extractOAM(emulator);
    const { pixels } = SpriteHandler.getSpritePixels(emulator, sprite);
    expect(pixels.filter((p) => p !== 0).length).toBeGreaterThan(8);
  });

  test('written PNGs are 8x8', () => {
    const outDir = tmpdir('8x8');
    new SpritesCommand(emulator).execute({
      format: 'oam',
      outputDir: outDir,
      individual: true
    });

    const png = PNG.sync.read(fs.readFileSync(path.join(outDir, 'oam', 'sprite_00.png')));
    expect(png.width).toBe(8);
    expect(png.height).toBe(8);
  });
});

describe('sprite flipping', () => {
  /**
   * Both cartridges lean on this constantly - SMB3 draws 3600 horizontally
   * flipped sprites in 200 frames, Castlevania 1085 horizontal and 400
   * vertical - but nothing asserted the result was right until now.
   */
  test('the four flip combinations mirror the tile correctly', () => {
    const emulator = boot('sprites8x8.nes', 40);
    const sprites = SpriteHandler.extractOAM(emulator).filter((s) => s.visible);
    expect(sprites).toHaveLength(4);

    const corners = sprites.map((sprite) => {
      const { pixels } = SpriteHandler.getSpritePixels(emulator, sprite);
      return [pixels[0], pixels[7], pixels[56], pixels[63]];
    });

    // The tile's heavy corner is top-left. Each flip moves it to the opposite
    // side on that axis and nowhere else.
    expect(corners[0]).toEqual([3, 0, 1, 0]); // as drawn
    expect(corners[1]).toEqual([0, 3, 0, 1]); // mirrored left to right
    expect(corners[2]).toEqual([1, 0, 3, 0]); // mirrored top to bottom
    expect(corners[3]).toEqual([0, 1, 0, 3]); // both
  });

  test('flipping is its own inverse', () => {
    const rows = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) rows.push(y * 8 + x);
    }

    expect(SpriteHandler.flipHorizontal(SpriteHandler.flipHorizontal(rows, 8, 8), 8, 8)).toEqual(rows);
    expect(SpriteHandler.flipVertical(SpriteHandler.flipVertical(rows, 8, 8), 8, 8)).toEqual(rows);
  });

  test('a vertical flip of an 8x16 sprite swaps its two tiles as well', () => {
    // The pair is one 16-row image, so mirroring it moves the bottom tile's
    // rows to the top. Flipping each tile in place would be wrong.
    const top = new Array(64).fill(1);
    const bottom = new Array(64).fill(2);
    const flipped = SpriteHandler.flipVertical([...top, ...bottom], 8, 16);

    expect(flipped.slice(0, 64).every((p) => p === 2)).toBe(true);
    expect(flipped.slice(64).every((p) => p === 1)).toBe(true);
  });
});
