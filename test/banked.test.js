const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { boot, tmpdir } = require('./helpers');
const SpriteHandler = require('../src/formats/image/spritesheet');
const SpritesCommand = require('../src/commands/sprites');

/**
 * banked.nes is an MMC3 cartridge that swaps the 1KB CHR bank at $1000 partway
 * down every frame. The top half of the screen draws tile 4 as a filled block
 * (colour indices 1 and 3); the bottom half draws the same tile index as a
 * hollow ring (index 2 border, index 0 inside). Two sprites with an identical
 * tile byte of $05 sit at screen rows 50 and 180.
 *
 * This is the case a real SMB3 cartridge exposed and that no NROM fixture can:
 * pattern memory read at the frame boundary is not what the top of the screen
 * was drawn from.
 */
const TOP_ROW = 40;
const BOTTOM_ROW = 190;

function tileSignature(tile) {
  return tile.join('');
}

describe('mid-frame CHR bank switching', () => {
  let emulator;

  beforeAll(() => {
    emulator = boot('banked.nes', 60);
  });

  test('the fixture really is a mapper 4 cartridge', () => {
    const rom = fs.readFileSync(path.join(__dirname, 'fixtures', 'banked.nes'));
    expect((rom[7] & 0xf0) | (rom[6] >> 4)).toBe(4);
  });

  test('the banks at $1000 change partway down a frame', () => {
    const nes = emulator.getNES();
    const switches = [];
    const original = nes.mmap.load1kVromBank.bind(nes.mmap);

    nes.mmap.load1kVromBank = (bank, address) => {
      if (address === 0x1000) {
        switches.push({ bank, row: nes.ppu.scanline - 21 });
      }
      return original(bank, address);
    };

    emulator.run(1);
    nes.mmap.load1kVromBank = original;

    expect(switches).toHaveLength(2);
    // One before the visible area, one somewhere in the middle of it.
    expect(switches[0].row).toBeLessThan(0);
    expect(switches[1].row).toBeGreaterThan(TOP_ROW);
    expect(switches[1].row).toBeLessThan(BOTTOM_ROW);
    expect(switches[0].bank).not.toBe(switches[1].bank);
  });

  test('the same tile index reads differently at the top and bottom of the screen', () => {
    const top = emulator.getPatternTile(1, 4, TOP_ROW);
    const bottom = emulator.getPatternTile(1, 4, BOTTOM_ROW);

    expect(tileSignature(top)).not.toBe(tileSignature(bottom));
    // Filled block above: an opaque interior.
    expect(top[9]).toBe(3);
    // Hollow ring below: a transparent interior.
    expect(bottom[9]).toBe(0);
    expect(bottom[0]).toBe(2);
  });

  test('reading without a screen row gets the last bank of the frame', () => {
    // This documents the trap rather than endorsing it: the naive read returns
    // the bottom half's tiles, which is why every character in a game like this
    // used to extract as a blank image.
    const naive = emulator.getPatternTile(1, 4);
    const bottom = emulator.getPatternTile(1, 4, BOTTOM_ROW);
    const top = emulator.getPatternTile(1, 4, TOP_ROW);

    expect(tileSignature(naive)).toBe(tileSignature(bottom));
    expect(tileSignature(naive)).not.toBe(tileSignature(top));
  });

  test('two sprites with the same tile byte extract as different art', () => {
    const sprites = SpriteHandler.extractOAM(emulator);
    const [upper, lower] = sprites;

    expect(upper.tile).toBe(0x05);
    expect(lower.tile).toBe(0x05);
    expect(upper.screenY).toBe(50);
    expect(lower.screenY).toBe(180);

    const a = SpriteHandler.getSpritePixels(emulator, upper).pixels;
    const b = SpriteHandler.getSpritePixels(emulator, lower).pixels;

    expect(tileSignature(a)).not.toBe(tileSignature(b));
    expect(a[9]).toBe(3); // filled
    expect(b[9]).toBe(0); // hollow
  });

  test('the written PNGs differ, and the hollow one is transparent inside', () => {
    const outDir = tmpdir('banked');
    new SpritesCommand(emulator).execute({
      format: 'oam',
      outputDir: outDir,
      individual: true
    });

    const read = (name) =>
      PNG.sync.read(fs.readFileSync(path.join(outDir, 'oam', name)));
    const upper = read('sprite_00.png');
    const lower = read('sprite_01.png');

    expect(Buffer.compare(upper.data, lower.data)).not.toBe(0);

    const alphaAt = (png, x, y) => png.data[(y * png.width + x) * 4 + 3];
    expect(alphaAt(upper, 1, 1)).toBe(255); // filled interior
    expect(alphaAt(lower, 1, 1)).toBe(0); // hollow interior
    expect(alphaAt(lower, 0, 0)).toBe(255); // ring edge
  });
});
