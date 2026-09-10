#!/usr/bin/env node
/**
 * Generates the test ROMs in test/fixtures/.
 *
 * These are our own NROM programs, not commercial dumps, so they can live in
 * the repository and give the test suite deterministic ground truth: a known
 * screen colour, a known controller-port protocol, a known sprite at a known
 * position with known pattern data.
 *
 * Run: node tools/make-fixtures.js
 */

const fs = require('fs');
const path = require('path');
const { Assembler, M, buildNROM, encodeTile, resetPreamble } = require('./asm6502');

const OUT_DIR = path.join(__dirname, '..', 'test', 'fixtures');

const PPUCTRL = 0x2000;
const PPUMASK = 0x2001;
const PPUSTATUS = 0x2002;
const OAMADDR = 0x2003;
const OAMDATA = 0x2004;
const PPUSCROLL = 0x2005;
const PPUADDR = 0x2006;
const PPUDATA = 0x2007;
const JOY1 = 0x4016;

/** Point PPUADDR at a VRAM address (high byte first, after clearing the latch). */
function setPpuAddr(a, addr) {
  M.ldaAbs(a, PPUSTATUS);
  M.ldaImm(a, (addr >> 8) & 0xff);
  M.staAbs(a, PPUADDR);
  M.ldaImm(a, addr & 0xff);
  M.staAbs(a, PPUADDR);
}

/**
 * solid.nes - fills the screen with a single known NES colour.
 *
 * CHR is all zeroes, so every background pixel is colour index 0 and resolves
 * to the universal background colour at $3F00. Colour $16 is a red, chosen
 * because its red and blue channels differ sharply: if the framebuffer's byte
 * order is ever misread, this ROM renders blue instead and the test fails.
 */
function buildSolid() {
  const a = new Assembler(0xc000);
  resetPreamble(a);

  setPpuAddr(a, 0x3f00);
  M.ldaImm(a, 0x16);
  M.staAbs(a, PPUDATA);

  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUCTRL);
  M.ldaImm(a, 0x0e); // show background, no left-edge clipping
  M.staAbs(a, PPUMASK);

  a.label('forever');
  M.jmp(a, 'forever');

  return buildNROM(a.assemble(), Buffer.alloc(8192, 0));
}

/**
 * input.nes - latches the controller into zero page every frame.
 *
 * Each frame it strobes $4016 and shifts the eight button bits into $0010, so
 * a test can read nes.cpu.mem[0x10] and see exactly which buttons the emulator
 * delivered. Bit 7 is A, then B, Select, Start, Up, Down, Left, and bit 0 is
 * Right. The background colour also flips from blue to red while any button is
 * held, which makes the same ROM usable as a visual check.
 */
function buildInput() {
  const a = new Assembler(0xc000);
  const BUTTONS = 0x10;

  resetPreamble(a);

  setPpuAddr(a, 0x3f00);
  M.ldaImm(a, 0x11); // blue: nothing held
  M.staAbs(a, PPUDATA);

  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUCTRL);
  M.ldaImm(a, 0x0e);
  M.staAbs(a, PPUMASK);

  a.label('main');
  a.label('waitvb');
  M.bitAbs(a, PPUSTATUS);
  M.bpl(a, 'waitvb');

  // Strobe the controller, then clock out eight bits.
  M.ldaImm(a, 0x01);
  M.staAbs(a, JOY1);
  M.ldaImm(a, 0x00);
  M.staAbs(a, JOY1);
  M.ldxImm(a, 0x08);
  a.label('readbit');
  M.ldaAbs(a, JOY1);
  M.lsrA(a); // button bit into carry
  M.rolZp(a, BUTTONS); // carry into the accumulating byte
  M.dex(a);
  M.bne(a, 'readbit');

  M.ldaZp(a, BUTTONS);
  M.beq(a, 'nothing');
  M.ldyImm(a, 0x16); // red: something held
  M.jmp(a, 'write');
  a.label('nothing');
  M.ldyImm(a, 0x11);
  a.label('write');

  setPpuAddr(a, 0x3f00);
  M.styAbs(a, PPUDATA);

  // Leave the address latch somewhere harmless for the next frame.
  setPpuAddr(a, 0x0000);
  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUSCROLL);
  M.staAbs(a, PPUSCROLL);

  M.jmp(a, 'main');

  return buildNROM(a.assemble(), Buffer.alloc(8192, 0));
}

/**
 * sprites.nes - two 8x16 sprites drawn from pattern table 1.
 *
 * Sprite 0 sits at (64, 100) using sprite palette 1; sprite 1 at (120, 100)
 * using palette 0. Both use tile byte $05, which in 8x16 mode means "pattern
 * table 1, tiles 4 and 5" - bit 0 of the tile byte selects the table, so this
 * fixture fails if that bit is ignored.
 *
 * The tile art puts colour index 0 in the corners, so a correct extraction has
 * transparent corners; and the background is a distinct light blue, so any
 * background bleed into an extracted sprite is immediately visible.
 */
function buildSpriteRom(sprites) {
  const chr = Buffer.alloc(8192, 0);

  // Pattern table 1 starts at CHR offset $1000; tiles 4 and 5 live at +$40/+$50.
  const top = [
    0, 0, 1, 1, 1, 1, 0, 0,
    0, 1, 2, 2, 2, 2, 1, 0,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
  ];
  const bottom = [
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    1, 2, 3, 3, 3, 3, 2, 1,
    0, 1, 2, 2, 2, 2, 1, 0,
    0, 0, 1, 1, 1, 1, 0, 0,
  ];
  encodeTile(top).copy(chr, 0x1000 + 4 * 16);
  encodeTile(bottom).copy(chr, 0x1000 + 5 * 16);

  // $3F00-$3F1F. Background is $21; sprite palette 0 is red/green/white and
  // sprite palette 1 is blue/orange/white, so the two are never confusable.
  const palettes = [
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x16, 0x2a, 0x30, 0x21, 0x12, 0x27, 0x30,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
  ];

  // A full 256-byte OAM image. Unused sprites are parked at y = $FF, which is
  // what real games do during initialisation - leaving them at zero would put
  // 62 blank sprites across the top of the screen.
  const oam = new Array(256).fill(0);
  for (let i = 0; i < 64; i++) {
    oam[i * 4] = 0xff;
  }
  sprites.forEach(({ x, screenY, tile, attributes }, i) => {
    // y is stored as screenY - 1; the PPU adds it back when it draws.
    oam.splice(i * 4, 4, screenY - 1, tile, attributes, x);
  });

  const a = new Assembler(0xc000);
  resetPreamble(a);

  setPpuAddr(a, 0x3f00);
  M.ldxImm(a, 0x00);
  a.label('palloop');
  M.ldaAbsX(a, 'paltable');
  M.staAbs(a, PPUDATA);
  M.inx(a);
  M.cpxImm(a, palettes.length);
  M.bne(a, 'palloop');

  M.ldaImm(a, 0x00);
  M.staAbs(a, OAMADDR);
  M.ldxImm(a, 0x00);
  a.label('oamloop');
  M.ldaAbsX(a, 'oamtable');
  M.staAbs(a, OAMDATA);
  M.inx(a);
  M.bne(a, 'oamloop'); // 256 bytes: stops when X wraps back to zero

  M.ldaImm(a, 0x20); // 8x16 sprites, NMI disabled
  M.staAbs(a, PPUCTRL);
  M.ldaImm(a, 0x1e); // show background and sprites, no left-edge clipping
  M.staAbs(a, PPUMASK);

  M.ldaAbs(a, PPUSTATUS);
  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUSCROLL);
  M.staAbs(a, PPUSCROLL);

  a.label('forever');
  M.jmp(a, 'forever');

  a.label('paltable');
  a.db(palettes);
  a.label('oamtable');
  a.db(oam);

  return buildNROM(a.assemble(), chr);
}

/** Two lone 8x16 sprites, far enough apart never to be grouped together. */
function buildSprites() {
  return buildSpriteRom([
    { x: 64, screenY: 100, tile: 0x05, attributes: 0x01 }, // palette 1
    { x: 120, screenY: 100, tile: 0x05, attributes: 0x00 } // palette 0
  ]);
}

/**
 * metasprite.nes - a 16x32 character built from four adjacent 8x16 sprites,
 * plus one lone sprite up in the HUD area on a different palette.
 *
 * Clustering should find exactly one metasprite: the four-sprite character.
 * The HUD sprite is there so the --min-y and --palettes filters have something
 * to exclude, and so a filter that is too permissive is visible as an extra
 * candidate.
 */
function buildMetasprite() {
  return buildSpriteRom([
    { x: 64, screenY: 100, tile: 0x05, attributes: 0x01 },
    { x: 72, screenY: 100, tile: 0x05, attributes: 0x01 },
    { x: 64, screenY: 116, tile: 0x05, attributes: 0x01 },
    { x: 72, screenY: 116, tile: 0x05, attributes: 0x01 },
    { x: 200, screenY: 16, tile: 0x05, attributes: 0x02 }
  ]);
}

const FIXTURES = {
  'solid.nes': buildSolid,
  'input.nes': buildInput,
  'sprites.nes': buildSprites,
  'metasprite.nes': buildMetasprite,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, build] of Object.entries(FIXTURES)) {
  const rom = build();
  fs.writeFileSync(path.join(OUT_DIR, name), rom);
  console.log(`${name}: ${rom.length} bytes`);
}
