const { boot } = require('./helpers');
const MetaspriteAnalyzer = require('../src/formats/image/metasprite');
const SpriteHandler = require('../src/formats/image/spritesheet');

/**
 * padded.nes draws a 16x16 character but allocates four 8x16 sprites for it,
 * the upper two pointed at a blank tile. This is what SMB1 does - small Mario
 * is eight sprites, four of them tile $FC - and taking OAM at face value gives
 * a 16x32 character with an empty top half.
 */
describe('blank padding sprites', () => {
  let emulator;

  beforeAll(() => {
    emulator = boot('padded.nes', 40);
  });

  test('a blank tile is recognised as drawing nothing', () => {
    expect(emulator.isPatternTileBlank(1, 0)).toBe(true);
    expect(emulator.isPatternTileBlank(1, 4)).toBe(false);
  });

  test('the padding sprites are present in OAM and look ordinary', () => {
    const sprites = SpriteHandler.extractOAM(emulator).filter((s) => s.visible);
    expect(sprites).toHaveLength(4);
    // Nothing about their OAM entries marks them out; only the tile data does.
    expect(sprites.filter((s) => emulator.isSpriteBlank(s))).toHaveLength(2);
    expect(sprites.filter((s) => !emulator.isSpriteBlank(s))).toHaveLength(2);
  });

  test('the character comes out at the size of its art, not its allocation', () => {
    const found = new MetaspriteAnalyzer(emulator).analyzeMetasprites(10);

    expect(found).toHaveLength(1);
    // 16x16, not the 16x32 the four OAM entries would suggest.
    expect(found[0].width).toBe(16);
    expect(found[0].height).toBe(16);
    expect(found[0].spriteCount).toBe(2);
  });

  test('a rendered pose has no empty band where the padding was', () => {
    const found = new MetaspriteAnalyzer(emulator).analyzeMetasprites(10);
    const png = found[0].png;

    let opaqueRows = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (png.data[(y * png.width + x) * 4 + 3]) {
          opaqueRows += 1;
          break;
        }
      }
    }

    expect(opaqueRows).toBe(png.height);
  });
});
