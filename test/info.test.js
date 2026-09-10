const { execFileSync } = require('child_process');
const path = require('path');
const { fixture } = require('./helpers');

const CLI = path.join(__dirname, '..', 'bin', 'nes-cli.js');
const info = (rom, args = []) =>
  execFileSync('node', [CLI, 'info', rom, ...args], { encoding: 'utf8' });

describe('nes-cli info', () => {
  test('reports an NROM cartridge with CHR-ROM', () => {
    const out = info(fixture('sprites.nes'), ['--frames', '60']);
    expect(out).toMatch(/mapper\s+0 \(NROM\)/);
    expect(out).toMatch(/CHR\s+8 KB ROM/);
    expect(out).toMatch(/sprite size\s+8x16/);
  });

  test('reports an MMC3 cartridge that banks CHR', () => {
    const out = info(fixture('banked.nes'), ['--frames', '60']);
    expect(out).toMatch(/mapper\s+4 \(MMC3\)/);
    expect(out).toMatch(/tiles come from banked ROM/);
  });

  test('distinguishes CHR-RAM, where the mapper never touches tiles', () => {
    // The distinction that made Zelda a poor test of MMC1: it is mapper 1, but
    // its tiles come from RAM, so the mapper's CHR routines never run.
    const out = info(fixture('chrram.nes'), ['--frames', '60']);
    expect(out).toMatch(/CHR\s+none - CHR-RAM/);
    expect(out).toMatch(/0 mapper bank calls/);
    expect(out).toMatch(/tiles come from RAM/);
  });

  test('reports 8x8 mode and which pattern table it uses', () => {
    const out = info(fixture('sprites8x8.nes'), ['--frames', '60']);
    expect(out).toMatch(/sprite size\s+8x8/);
    expect(out).toMatch(/sprite table 1/);
  });

  test('a missing or non-iNES file fails rather than reporting nonsense', () => {
    expect(() => info('/nonexistent.nes')).toThrow();
    expect(() => info(path.join(__dirname, 'helpers.js'))).toThrow();
  });
});
