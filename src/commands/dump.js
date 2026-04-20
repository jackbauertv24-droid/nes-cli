const chalk = require('chalk');

class DumpCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    if (options.cpuRegisters) {
      return this.dumpCPU();
    }

    if (options.ppuRegisters) {
      return this.dumpPPU();
    }

    if (options.memory) {
      const range = this.parseRange(options.range || '0x0000-0x00FF');
      return this.dumpMemory(range.start, range.length);
    }

    if (options.oam) {
      return this.dumpOAM();
    }

    // Default: dump everything
    this.dumpCPU();
    this.dumpPPU();
    return true;
  }

  dumpCPU() {
    const state = this.emulator.getCPUState();
    console.log(chalk.yellow('\nCPU Registers:'));
    console.log(`  PC: $${state.pc.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`  SP: $${state.sp.toString(16).toUpperCase().padStart(2, '0')}`);
    console.log(`  A:  $${state.a.toString(16).toUpperCase().padStart(2, '0')} (${state.a})`);
    console.log(`  X:  $${state.x.toString(16).toUpperCase().padStart(2, '0')} (${state.x})`);
    console.log(`  Y:  $${state.y.toString(16).toUpperCase().padStart(2, '0')} (${state.y})`);
    console.log(`  P:  $${state.status.toString(16).toUpperCase().padStart(2, '0')} (${this.decodeStatus(state.status)})`);
    return true;
  }

  dumpPPU() {
    const state = this.emulator.getPPUState();
    console.log(chalk.yellow('\nPPU Registers:'));
    console.log(`  Frame:     ${state.frame}`);
    console.log(`  Scanline:  ${state.scanline}`);
    console.log(`  Cycle:     ${state.cycle}`);
    console.log(`  VRAM:      $${state.vramAddress.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`  Temp:      $${state.tempAddress.toString(16).toUpperCase().padStart(4, '0')}`);
    return true;
  }

  dumpMemory(start, length) {
    const mem = this.emulator.getMemory(start, length);
    console.log(chalk.yellow(`\nMemory [$${start.toString(16).padStart(4, '0')}-$${(start + length - 1).toString(16).padStart(4, '0')}]:`));
    
    for (let i = 0; i < length; i += 16) {
      let line = `  $${(start + i).toString(16).toUpperCase().padStart(4, '0')}: `;
      const hexBytes = [];
      const asciiChars = [];
      
      for (let j = 0; j < 16 && (i + j) < length; j++) {
        const byte = mem[i + j];
        hexBytes.push(byte.toString(16).toUpperCase().padStart(2, '0'));
        asciiChars.push(byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.');
      }
      
      line += hexBytes.join(' ').padEnd(48, ' ');
      line += ' |' + asciiChars.join('') + '|';
      console.log(line);
    }
    return true;
  }

  dumpOAM() {
    const oam = this.emulator.getOAM();
    console.log(chalk.yellow('\nOAM (Sprite Memory):'));
    
    for (let i = 0; i < 64; i++) {
      const offset = i * 4;
      const y = oam[offset];
      const tile = oam[offset + 1];
      const attr = oam[offset + 2];
      const x = oam[offset + 3];
      
      if (y < 240) { // Only show visible sprites
        console.log(`  Sprite ${i.toString().padStart(2)}: Y=${y.toString().padStart(3)} X=${x.toString().padStart(3)} Tile=$${tile.toString(16).toUpperCase().padStart(2, '0')} Attr=$${attr.toString(16).toUpperCase().padStart(2, '0')}`);
      }
    }
    return true;
  }

  parseRange(rangeStr) {
    const parts = rangeStr.split('-');
    const start = parseInt(parts[0].replace('0x', ''), 16);
    const end = parseInt(parts[1].replace('0x', ''), 16);
    return { start, length: end - start + 1 };
  }

  decodeStatus(status) {
    const flags = [];
    if (status & 0x80) flags.push('N');
    if (status & 0x40) flags.push('V');
    if (status & 0x20) flags.push('U');
    if (status & 0x10) flags.push('B');
    if (status & 0x08) flags.push('D');
    if (status & 0x04) flags.push('I');
    if (status & 0x02) flags.push('Z');
    if (status & 0x01) flags.push('C');
    return flags.join('') || '-';
  }
}

module.exports = DumpCommand;
