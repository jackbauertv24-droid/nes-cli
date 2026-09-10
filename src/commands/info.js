const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const jsnes = require('jsnes');
const Emulator = require('../core/emulator');

// Mappers jsnes implements. Anything else loads as a blank screen or throws,
// so it is worth knowing before spending time on a capture.
const SUPPORTED = [0, 1, 2, 3, 4, 5, 7, 11, 34, 38, 66, 94, 140, 180];

const MAPPER_NAMES = {
  0: 'NROM',
  1: 'MMC1',
  2: 'UNROM',
  3: 'CNROM',
  4: 'MMC3',
  5: 'MMC5',
  7: 'AxROM',
  11: 'Color Dreams',
  66: 'GxROM'
};

/**
 * Report what a cartridge is and how it draws, without capturing anything.
 *
 * The point is to check a ROM's properties before investing in a full run. It
 * is easy to pick a cartridge for a reason that turns out not to hold - Zelda
 * was chosen here to exercise MMC1's CHR banking, and it is indeed MMC1, but it
 * is also CHR-RAM, so those routines never run at all. That took a run to find
 * out and takes a second to see here.
 */
class InfoCommand {
  execute(romPath, options = {}) {
    if (!fs.existsSync(romPath)) {
      console.error(chalk.red(`ROM not found: ${romPath}`));
      return false;
    }

    const rom = fs.readFileSync(romPath);
    if (rom.slice(0, 4).toString('binary') !== 'NES\x1a') {
      console.error(chalk.red(`Not an iNES file: ${romPath}`));
      return false;
    }

    const mapper = (rom[7] & 0xf0) | (rom[6] >> 4);
    const prgBytes = rom[4] * 16384;
    const chrBytes = rom[5] * 8192;
    const supported = SUPPORTED.includes(mapper);
    const name = MAPPER_NAMES[mapper];

    console.log(chalk.cyan(path.basename(romPath)));
    console.log(
      `  mapper       ${mapper}${name ? ` (${name})` : ''} ` +
        (supported ? chalk.green('- supported') : chalk.red('- NOT supported by jsnes'))
    );
    console.log(`  PRG          ${prgBytes / 1024} KB`);
    console.log(
      `  CHR          ${chrBytes ? `${chrBytes / 1024} KB ROM` : chalk.yellow('none - CHR-RAM')}`
    );
    console.log(`  mirroring    ${rom[6] & 1 ? 'vertical' : 'horizontal'}`);
    console.log(`  battery      ${rom[6] & 2 ? 'yes' : 'no'}`);

    if (!supported) {
      return false;
    }

    const frames = parseInt(options.frames, 10) || 600;
    const emulator = new Emulator();
    emulator.loadROM(romPath);

    // Count how tile data actually reaches the PPU. A cartridge with CHR-ROM
    // and a banking mapper shows bank calls; a CHR-RAM one shows $2007 writes.
    let bankCalls = 0;
    let tileWrites = 0;
    const nes = emulator.getNES();

    for (const method of ['loadVromBank', 'load1kVromBank', 'load2kVromBank', 'load8kVromBank']) {
      if (typeof nes.mmap[method] !== 'function') continue;
      const original = nes.mmap[method].bind(nes.mmap);
      nes.mmap[method] = (...args) => {
        bankCalls += 1;
        return original(...args);
      };
    }

    const originalWrite = nes.ppu.writeMem.bind(nes.ppu);
    nes.ppu.writeMem = (address, value) => {
      if (address < 0x2000) tileWrites += 1;
      return originalWrite(address, value);
    };

    emulator.run(frames);

    const visible = emulator.getOAM();
    let onScreen = 0;
    for (let i = 0; i < 64; i++) {
      if (visible[i * 4] < 239) onScreen += 1;
    }

    console.log(chalk.gray(`  after ${frames} frames:`));
    console.log(`  sprite size  ${emulator.is8x16Sprites() ? '8x16' : '8x8'}`);
    console.log(`  sprite table ${emulator.getSpritePatternTable()} (8x8 mode only)`);
    console.log(`  sprites up   ${onScreen} of 64`);
    console.log(
      `  tile source  ${bankCalls} mapper bank calls, ${tileWrites} $2007 writes` +
        (bankCalls === 0 && tileWrites > 0 ? chalk.gray('  - tiles come from RAM') : '') +
        (bankCalls > 0 ? chalk.gray('  - tiles come from banked ROM') : '')
    );

    return true;
  }
}

module.exports = InfoCommand;
