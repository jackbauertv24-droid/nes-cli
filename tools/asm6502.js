/**
 * A deliberately tiny 6502 assembler.
 *
 * It exists so the test fixture ROMs in test/fixtures/ can be generated from
 * readable source rather than checked in as opaque byte arrays. It supports
 * only the addressing modes the fixtures actually use, and resolves labels in a
 * second pass.
 */

class Assembler {
  /** @param org CPU address the emitted code will be mapped at. */
  constructor(org) {
    this.org = org;
    this.bytes = [];
    this.labels = new Map();
    this.fixups = [];
  }

  get pc() {
    return this.org + this.bytes.length;
  }

  label(name) {
    if (this.labels.has(name)) {
      throw new Error(`Duplicate label: ${name}`);
    }
    this.labels.set(name, this.pc);
    return this;
  }

  /** Raw data bytes, for tables the code indexes into. */
  db(bytes) {
    for (const b of bytes) {
      this.bytes.push(b & 0xff);
    }
    return this;
  }

  /** Implied / accumulator: one opcode byte, no operand. */
  imp(opcode) {
    this.bytes.push(opcode);
    return this;
  }

  /** Immediate: #$nn */
  imm(opcode, value) {
    this.bytes.push(opcode, value & 0xff);
    return this;
  }

  /** Zero page: $nn */
  zp(opcode, addr) {
    this.bytes.push(opcode, addr & 0xff);
    return this;
  }

  /** Absolute: $nnnn. `target` may be a number or a label name. */
  abs(opcode, target) {
    this.bytes.push(opcode);
    if (typeof target === 'string') {
      this.fixups.push({ at: this.bytes.length, label: target, kind: 'abs' });
      this.bytes.push(0, 0);
    } else {
      this.bytes.push(target & 0xff, (target >> 8) & 0xff);
    }
    return this;
  }

  /** Relative branch to a label. */
  rel(opcode, label) {
    this.bytes.push(opcode);
    this.fixups.push({ at: this.bytes.length, label, kind: 'rel' });
    this.bytes.push(0);
    return this;
  }

  assemble() {
    for (const { at, label, kind } of this.fixups) {
      if (!this.labels.has(label)) {
        throw new Error(`Undefined label: ${label}`);
      }
      const target = this.labels.get(label);

      if (kind === 'abs') {
        this.bytes[at] = target & 0xff;
        this.bytes[at + 1] = (target >> 8) & 0xff;
      } else {
        // Relative offsets are measured from the instruction *after* the branch.
        const delta = target - (this.org + at + 1);
        if (delta < -128 || delta > 127) {
          throw new Error(`Branch to ${label} out of range (${delta})`);
        }
        this.bytes[at] = delta & 0xff;
      }
    }
    return Buffer.from(this.bytes);
  }
}

// Mnemonics, added as the fixtures need them.
const M = {
  sei: (a) => a.imp(0x78),
  cld: (a) => a.imp(0xd8),
  txs: (a) => a.imp(0x9a),
  inx: (a) => a.imp(0xe8),
  dex: (a) => a.imp(0xca),
  iny: (a) => a.imp(0xc8),
  dey: (a) => a.imp(0x88),
  lsrA: (a) => a.imp(0x4a),
  aslA: (a) => a.imp(0x0a),
  clc: (a) => a.imp(0x18),
  tax: (a) => a.imp(0xaa),

  ldaImm: (a, v) => a.imm(0xa9, v),
  ldxImm: (a, v) => a.imm(0xa2, v),
  ldyImm: (a, v) => a.imm(0xa0, v),
  andImm: (a, v) => a.imm(0x29, v),
  cpxImm: (a, v) => a.imm(0xe0, v),
  cpyImm: (a, v) => a.imm(0xc0, v),
  cmpImm: (a, v) => a.imm(0xc9, v),
  adcImm: (a, v) => a.imm(0x69, v),

  ldaZp: (a, addr) => a.zp(0xa5, addr),
  staZp: (a, addr) => a.zp(0x85, addr),
  rolZp: (a, addr) => a.zp(0x26, addr),
  incZp: (a, addr) => a.zp(0xe6, addr),

  ldaAbs: (a, t) => a.abs(0xad, t),
  staAbs: (a, t) => a.abs(0x8d, t),
  styAbs: (a, t) => a.abs(0x8c, t),
  stxAbs: (a, t) => a.abs(0x8e, t),
  bitAbs: (a, t) => a.abs(0x2c, t),
  ldaAbsX: (a, t) => a.abs(0xbd, t),
  jmp: (a, t) => a.abs(0x4c, t),

  bpl: (a, l) => a.rel(0x10, l),
  bne: (a, l) => a.rel(0xd0, l),
  beq: (a, l) => a.rel(0xf0, l),
};

/**
 * Wrap assembled code in a 16KB NROM PRG bank with all three vectors pointing
 * at the reset entry, then prepend an iNES header and append CHR.
 *
 * Code is placed at $C000, where a 16KB PRG bank is mirrored into the upper
 * half of the address space.
 */
function buildNROM(code, chr) {
  const PRG_SIZE = 16384;
  const prg = Buffer.alloc(PRG_SIZE, 0);
  if (code.length > PRG_SIZE - 6) {
    throw new Error('Code does not fit in one PRG bank');
  }
  code.copy(prg, 0);
  prg.writeUInt16LE(0xc000, PRG_SIZE - 6); // NMI
  prg.writeUInt16LE(0xc000, PRG_SIZE - 4); // RESET
  prg.writeUInt16LE(0xc000, PRG_SIZE - 2); // IRQ

  const header = Buffer.alloc(16, 0);
  header.write('NES\x1a', 0, 'binary');
  header[4] = 1; // 1 x 16KB PRG
  header[5] = chr.length / 8192; // n x 8KB CHR
  header[6] = 0; // mapper 0, horizontal mirroring
  header[7] = 0;

  return Buffer.concat([header, prg, chr]);
}

/** Encode an 8x8 tile (64 colour indices, 0-3) into the NES 2bpp planar format. */
function encodeTile(indices) {
  const out = Buffer.alloc(16, 0);
  for (let y = 0; y < 8; y++) {
    let lo = 0;
    let hi = 0;
    for (let x = 0; x < 8; x++) {
      const px = indices[y * 8 + x] & 3;
      lo |= (px & 1) << (7 - x);
      hi |= ((px >> 1) & 1) << (7 - x);
    }
    out[y] = lo;
    out[y + 8] = hi;
  }
  return out;
}

/** Emit the standard reset preamble: disable interrupts, wait out PPU warm-up. */
function resetPreamble(a) {
  M.sei(a);
  M.cld(a);
  M.ldxImm(a, 0xff);
  M.txs(a);
  a.label('vblank1');
  M.bitAbs(a, 0x2002);
  M.bpl(a, 'vblank1');
  a.label('vblank2');
  M.bitAbs(a, 0x2002);
  M.bpl(a, 'vblank2');
}

/**
 * Wrap assembled code in an MMC3 (mapper 4) cartridge image.
 *
 * MMC3 always maps the last 8KB PRG bank at $E000, whatever the bank registers
 * say, so code placed there - including the vectors - is reachable from reset
 * without any PRG banking. Code is therefore assembled at $E000 and written
 * into the final bank.
 */
function buildMMC3(code, chr) {
  const PRG_SIZE = 32768; // 2 x 16KB, four 8KB banks
  const LAST_BANK = PRG_SIZE - 8192;
  const prg = Buffer.alloc(PRG_SIZE, 0);

  if (code.length > 8192 - 6) {
    throw new Error('Code does not fit in the fixed last PRG bank');
  }
  code.copy(prg, LAST_BANK);

  prg.writeUInt16LE(0xe000, PRG_SIZE - 6); // NMI
  prg.writeUInt16LE(0xe000, PRG_SIZE - 4); // RESET
  prg.writeUInt16LE(0xe000, PRG_SIZE - 2); // IRQ

  const header = Buffer.alloc(16, 0);
  header.write('NES\x1a', 0, 'binary');
  header[4] = PRG_SIZE / 16384;
  header[5] = chr.length / 8192;
  header[6] = (4 << 4) | 0x01; // mapper 4, vertical mirroring
  header[7] = 0;

  return Buffer.concat([header, prg, chr]);
}

module.exports = { Assembler, M, buildNROM, buildMMC3, encodeTile, resetPreamble };
