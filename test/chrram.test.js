const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');
const Emulator = require('../src/core/emulator');
const MetaspriteAnalyzer = require('../src/formats/image/metasprite');
const AnimationTracker = require('../src/formats/image/animation');
const SpriteHandler = require('../src/formats/image/spritesheet');

/**
 * chrram.nes has no CHR-ROM. The pattern tables are RAM, filled by the program
 * itself, and it animates by rewriting tiles 4 and 5 every 16 frames while the
 * sprite's OAM tile byte stays at $05 throughout. This is how UNROM cartridges
 * such as Castlevania work.
 */
describe('CHR-RAM cartridges', () => {
  test('the fixture really has no CHR-ROM', () => {
    const rom = fs.readFileSync(path.join(__dirname, 'fixtures', 'chrram.nes'));
    expect(rom[5]).toBe(0);

    const emulator = boot('chrram.nes', 40);
    expect(emulator.getNES().rom.vromCount).toBe(0);
  });

  test('tile data comes from RAM and changes as the program rewrites it', () => {
    const emulator = boot('chrram.nes', 40);
    const first = emulator.getPatternTile(1, 4, 100);
    emulator.run(16);
    const second = emulator.getPatternTile(1, 4, 100);

    expect(first.join('')).not.toBe(second.join(''));
    // Filled block alternating with a hollow ring.
    expect(first[9]).toBe(3);
    expect(second[9]).toBe(0);
  });

  test('the recorder tracks $2007 writes, not just mapper bank loads', () => {
    const emulator = new Emulator();
    emulator.loadROM(path.join(__dirname, 'fixtures', 'chrram.nes'));
    emulator.run(40);

    const nes = emulator.getNES();
    // A CHR-RAM cartridge never calls these; if the recorder only watched them
    // it would have nothing but the pre-frame snapshot.
    let bankLoads = 0;
    const original = nes.mmap.load1kVromBank;
    nes.mmap.load1kVromBank = (...args) => {
      bankLoads += 1;
      return original.apply(nes.mmap, args);
    };

    emulator.run(40);
    expect(bankLoads).toBe(0);
    expect(emulator.chrRecorder.segments.length).toBeGreaterThan(1);
  });

  test('the sprite keeps one tile byte the whole time', () => {
    const emulator = boot('chrram.nes', 40);
    const tiles = new Set();

    for (let i = 0; i < 40; i++) {
      emulator.run(1);
      const [sprite] = SpriteHandler.extractOAM(emulator).filter((s) => s.visible);
      tiles.add(sprite.tile);
    }

    // Nothing about OAM distinguishes the poses - only the art does.
    expect([...tiles]).toEqual([0x05]);
  });

  test('pose identity follows the art, not the tile index', () => {
    const emulator = boot('chrram.nes', 40);
    const analyzer = new MetaspriteAnalyzer(emulator);

    const keyNow = () => {
      const cluster = SpriteHandler.extractOAM(emulator).filter((s) => s.visible);
      const bounds = analyzer.getClusterBounds(cluster, 16);
      return analyzer.getSpriteConfigurationKey(cluster, bounds);
    };

    const before = keyNow();
    emulator.run(16);
    const after = keyNow();

    expect(before).not.toBe(after);
  });

  test('the alternation is recovered as an animation', () => {
    const emulator = boot('chrram.nes', 40);
    const clips = new AnimationTracker(emulator, { minSprites: 1 }).track(96, 8, 1);

    expect(clips).toHaveLength(1);
    expect(clips[0].poses).toHaveLength(2);

    // Poses alternate, and the middle ones are held the full sixteen frames.
    const timeline = clips[0].timeline;
    expect(timeline.length).toBeGreaterThan(4);
    for (const entry of timeline.slice(1, -1)) {
      expect(entry.frames).toBe(16);
    }
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].pose).not.toBe(timeline[i - 1].pose);
    }
  });

  test('the two poses render as different images', () => {
    const emulator = boot('chrram.nes', 40);
    const pixelsNow = () => {
      const [sprite] = SpriteHandler.extractOAM(emulator).filter((s) => s.visible);
      return SpriteHandler.getSpritePixels(emulator, sprite).pixels.join('');
    };

    const before = pixelsNow();
    emulator.run(16);
    expect(pixelsNow()).not.toBe(before);
  });
});
