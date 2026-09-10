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
const { Assembler, M, buildNROM, buildMMC3, encodeTile, resetPreamble } = require('./asm6502');

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

/**
 * banked.nes - an MMC3 cartridge that swaps CHR banks partway down every frame.
 *
 * This is the case that a real cartridge exposed and NROM fixtures cannot: SMB3
 * re-banks mid-frame so its status bar has its own tiles, which means pattern
 * memory read at the frame boundary is not what the top of the screen was drawn
 * from. Here the top half of the screen draws tile 4 from one 1KB bank and the
 * bottom half draws the same tile index from a different bank holding different
 * art, so extraction that ignores the scanline gets one of them wrong.
 *
 * The switch is cycle-timed rather than IRQ-driven: after the vblank flag
 * appears the code busy-waits roughly 13,000 CPU cycles, which lands somewhere
 * near the middle of the visible area. The exact row does not matter - the
 * tests assert well inside each half.
 */
function buildBanked() {
  const chr = Buffer.alloc(16384, 0);

  // A filled block, and a hollow ring - unmistakably different at a glance.
  const solid = [];
  const hollow = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const edge = x === 0 || x === 7 || y === 0 || y === 7;
      solid.push(edge ? 1 : 3);
      hollow.push(edge ? 2 : 0);
    }
  }

  // 1KB CHR bank 4 holds the "A" art, bank 5 the "B" art. Tiles 4 and 5 of a
  // bank live at +$40 and +$50 within it.
  encodeTile(solid).copy(chr, 4 * 1024 + 4 * 16);
  encodeTile(solid).copy(chr, 4 * 1024 + 5 * 16);
  encodeTile(hollow).copy(chr, 5 * 1024 + 4 * 16);
  encodeTile(hollow).copy(chr, 5 * 1024 + 5 * 16);

  const palettes = [
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x16, 0x2a, 0x30, 0x21, 0x12, 0x27, 0x30,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
  ];

  // One sprite in the top half and one in the bottom half, same tile byte $05.
  const oam = new Array(256).fill(0);
  for (let i = 0; i < 64; i++) {
    oam[i * 4] = 0xff;
  }
  oam.splice(0, 8, 50 - 1, 0x05, 0x01, 64, 180 - 1, 0x05, 0x01, 64);

  const a = new Assembler(0xe000);

  /** MMC3: point bank register `reg` at 1KB CHR bank `bank`. */
  const setBank = (reg, bank) => {
    M.ldaImm(a, reg);
    M.staAbs(a, 0x8000); // bank select
    M.ldaImm(a, bank);
    M.staAbs(a, 0x8001); // bank data
  };

  resetPreamble(a);

  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUCTRL);
  M.staAbs(a, PPUMASK);

  setBank(0, 0); // 2KB at $0000
  setBank(1, 2); // 2KB at $0800
  setBank(2, 4); // 1KB at $1000 - the one that gets swapped
  setBank(3, 6);
  setBank(4, 7);
  setBank(5, 8);

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
  M.bne(a, 'oamloop');

  M.ldaImm(a, 0x20); // 8x16 sprites
  M.staAbs(a, PPUCTRL);
  M.ldaImm(a, 0x1e); // background and sprites, no left-edge clipping
  M.staAbs(a, PPUMASK);

  a.label('main');
  a.label('waitvb');
  M.bitAbs(a, PPUSTATUS);
  M.bpl(a, 'waitvb');

  setBank(2, 4); // top of the screen draws from bank 4

  // Busy-wait about 13,000 cycles to reach the middle of the visible area.
  M.ldyImm(a, 0x28);
  a.label('outer');
  M.ldxImm(a, 0x40);
  a.label('inner');
  M.dex(a);
  M.bne(a, 'inner');
  M.dey(a);
  M.bne(a, 'outer');

  setBank(2, 5); // bottom of the screen draws from bank 5

  M.jmp(a, 'main');

  a.label('paltable');
  a.db(palettes);
  a.label('oamtable');
  a.db(oam);

  return buildMMC3(a.assemble(), chr);
}

/**
 * animation.nes - a 16x32 character that cycles through three poses while
 * walking to the right.
 *
 * Four 8x16 sprites in OAM slots 0-3 form the character. Every 8 frames the
 * tile bytes change to the next pose, and every other frame it moves one pixel
 * right, so a tracker has to follow both a changing appearance and a changing
 * position. The slots stay put, which is the common case on real hardware and
 * the strongest identity signal available.
 *
 * Poses are solid blocks of colour index 1, 2 and 3, with transparent corners.
 * They are meant to be told apart by a test, not admired.
 */
function buildAnimation() {
  const chr = Buffer.alloc(8192, 0);

  // Three poses x four sprites x two tiles = 24 tiles in pattern table 1.
  for (let pose = 0; pose < 3; pose++) {
    for (let tile = 0; tile < 8; tile++) {
      const pixels = new Array(64).fill(pose + 1);
      pixels[0] = 0;
      pixels[7] = 0;
      pixels[56] = 0;
      pixels[63] = 0;
      encodeTile(pixels).copy(chr, 0x1000 + (pose * 8 + tile) * 16);
    }
  }

  const palettes = [
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x16, 0x2a, 0x30, 0x21, 0x12, 0x27, 0x30,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
  ];

  // Tile bytes, four per pose. Bit 0 set selects pattern table 1; the rest is
  // the index of the pair's top tile.
  const tiles = [];
  for (let pose = 0; pose < 3; pose++) {
    for (let sprite = 0; sprite < 4; sprite++) {
      tiles.push(((pose * 8 + sprite * 2) & 0xfe) | 1);
    }
  }

  const FRAME = 0x10;
  const POSE_TIMER = 0x11;
  const POSE = 0x12;
  const XPOS = 0x13;

  const a = new Assembler(0xc000);
  resetPreamble(a);

  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUCTRL);
  M.staAbs(a, PPUMASK);
  M.staZp(a, FRAME);
  M.staZp(a, POSE_TIMER);
  M.staZp(a, POSE);
  M.ldaImm(a, 32);
  M.staZp(a, XPOS);

  setPpuAddr(a, 0x3f00);
  M.ldxImm(a, 0x00);
  a.label('palloop');
  M.ldaAbsX(a, 'paltable');
  M.staAbs(a, PPUDATA);
  M.inx(a);
  M.cpxImm(a, palettes.length);
  M.bne(a, 'palloop');

  // Park all 64 sprites off-screen once; the loop then rewrites only the four
  // that make up the character, which keeps the vblank work small.
  M.ldaImm(a, 0x00);
  M.staAbs(a, OAMADDR);
  M.ldyImm(a, 64);
  a.label('parkloop');
  M.ldaImm(a, 0xff);
  M.staAbs(a, OAMDATA);
  M.ldaImm(a, 0x00);
  M.staAbs(a, OAMDATA);
  M.staAbs(a, OAMDATA);
  M.staAbs(a, OAMDATA);
  M.dey(a);
  M.bne(a, 'parkloop');

  M.ldaImm(a, 0x20); // 8x16 sprites
  M.staAbs(a, PPUCTRL);
  M.ldaImm(a, 0x1e);
  M.staAbs(a, PPUMASK);

  a.label('main');
  a.label('waitvb');
  M.bitAbs(a, PPUSTATUS);
  M.bpl(a, 'waitvb');

  M.incZp(a, FRAME);

  // Advance the pose every 8 frames, wrapping after three.
  M.incZp(a, POSE_TIMER);
  M.ldaZp(a, POSE_TIMER);
  M.cmpImm(a, 8);
  M.bne(a, 'moved');
  M.ldaImm(a, 0x00);
  M.staZp(a, POSE_TIMER);
  M.incZp(a, POSE);
  M.ldaZp(a, POSE);
  M.cmpImm(a, 3);
  M.bne(a, 'moved');
  M.ldaImm(a, 0x00);
  M.staZp(a, POSE);
  a.label('moved');

  // Step one pixel right on every other frame.
  M.ldaZp(a, FRAME);
  M.andImm(a, 1);
  M.bne(a, 'nomove');
  M.incZp(a, XPOS);
  a.label('nomove');

  M.ldaImm(a, 0x00);
  M.staAbs(a, OAMADDR);

  // X indexes the tile table at pose * 4.
  M.ldaZp(a, POSE);
  M.aslA(a);
  M.aslA(a);
  M.tax(a);

  const emitSprite = (yValue, offsetX) => {
    M.ldaImm(a, yValue);
    M.staAbs(a, OAMDATA); // y
    M.ldaAbsX(a, 'tiletable');
    M.staAbs(a, OAMDATA); // tile
    M.ldaImm(a, 0x01);
    M.staAbs(a, OAMDATA); // attributes: sprite palette 1
    M.ldaZp(a, XPOS);
    if (offsetX) {
      M.clc(a);
      M.adcImm(a, offsetX);
    }
    M.staAbs(a, OAMDATA); // x
    M.inx(a);
  };

  emitSprite(99, 0); // top-left, screen row 100
  emitSprite(99, 8); // top-right
  emitSprite(115, 0); // bottom-left, screen row 116
  emitSprite(115, 8); // bottom-right

  M.jmp(a, 'main');

  a.label('paltable');
  a.db(palettes);
  a.label('tiletable');
  a.db(tiles);

  return buildNROM(a.assemble(), chr);
}

/**
 * chrram.nes - a cartridge with no CHR-ROM, animating by rewriting tiles.
 *
 * The iNES header declares zero CHR pages, so the PPU's pattern tables are RAM
 * and start empty; the program uploads tile data through $2007 itself. This is
 * how UNROM cartridges work - Castlevania among them - and it is a completely
 * different path from CHR bank switching: the mapper's bank routines are never
 * called at all.
 *
 * One 8x16 sprite sits at (64, 100) and its OAM tile byte never changes. What
 * changes is the tile data underneath it, rewritten every 16 frames to
 * alternate between a filled block and a hollow ring. Extraction that reads the
 * ROM file, or that only watches the mapper, sees nothing here.
 */
function buildChrRam() {
  const solid = [];
  const hollow = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const edge = x === 0 || x === 7 || y === 0 || y === 7;
      solid.push(edge ? 1 : 3);
      hollow.push(edge ? 2 : 0);
    }
  }
  // Tiles 4 and 5 of pattern table 1, so 32 bytes per pose.
  const artA = [...encodeTile(solid), ...encodeTile(solid)];
  const artB = [...encodeTile(hollow), ...encodeTile(hollow)];

  const palettes = [
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
    0x21, 0x16, 0x2a, 0x30, 0x21, 0x12, 0x27, 0x30,
    0x21, 0x0f, 0x0f, 0x0f, 0x21, 0x0f, 0x0f, 0x0f,
  ];

  const FRAME = 0x10;
  const a = new Assembler(0xc000);

  /** Upload 32 bytes from a table into $1040, where tiles 4 and 5 live. */
  const upload = (table, loopLabel) => {
    setPpuAddr(a, 0x1040);
    M.ldxImm(a, 0x00);
    a.label(loopLabel);
    M.ldaAbsX(a, table);
    M.staAbs(a, PPUDATA);
    M.inx(a);
    M.cpxImm(a, 0x20);
    M.bne(a, loopLabel);
  };

  resetPreamble(a);

  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUCTRL);
  M.staAbs(a, PPUMASK);
  M.staZp(a, FRAME);

  setPpuAddr(a, 0x3f00);
  M.ldxImm(a, 0x00);
  a.label('palloop');
  M.ldaAbsX(a, 'paltable');
  M.staAbs(a, PPUDATA);
  M.inx(a);
  M.cpxImm(a, palettes.length);
  M.bne(a, 'palloop');

  // Park every sprite, then place the one that matters.
  M.ldaImm(a, 0x00);
  M.staAbs(a, OAMADDR);
  M.ldyImm(a, 64);
  a.label('parkloop');
  M.ldaImm(a, 0xff);
  M.staAbs(a, OAMDATA);
  M.ldaImm(a, 0x00);
  M.staAbs(a, OAMDATA);
  M.staAbs(a, OAMDATA);
  M.staAbs(a, OAMDATA);
  M.dey(a);
  M.bne(a, 'parkloop');

  M.ldaImm(a, 0x00);
  M.staAbs(a, OAMADDR);
  M.ldaImm(a, 99); // screen row 100
  M.staAbs(a, OAMDATA);
  M.ldaImm(a, 0x05); // pattern table 1, tiles 4 and 5 - never changes
  M.staAbs(a, OAMDATA);
  M.ldaImm(a, 0x01); // sprite palette 1
  M.staAbs(a, OAMDATA);
  M.ldaImm(a, 64);
  M.staAbs(a, OAMDATA);

  M.ldaImm(a, 0x20); // 8x16 sprites
  M.staAbs(a, PPUCTRL);
  M.ldaImm(a, 0x1e);
  M.staAbs(a, PPUMASK);

  a.label('main');
  a.label('waitvb');
  M.bitAbs(a, PPUSTATUS);
  M.bpl(a, 'waitvb');

  M.incZp(a, FRAME);
  M.ldaZp(a, FRAME);
  M.andImm(a, 0x10); // bit 4 flips every 16 frames
  M.beq(a, 'useA');

  upload('artbtable', 'bloop');
  M.jmp(a, 'settle');

  a.label('useA');
  upload('artatable', 'aloop');

  a.label('settle');
  // Put the address latch and scroll back somewhere harmless.
  setPpuAddr(a, 0x0000);
  M.ldaImm(a, 0x00);
  M.staAbs(a, PPUSCROLL);
  M.staAbs(a, PPUSCROLL);

  M.jmp(a, 'main');

  a.label('paltable');
  a.db(palettes);
  a.label('artatable');
  a.db(artA);
  a.label('artbtable');
  a.db(artB);

  // Zero CHR pages: the pattern tables are RAM.
  return buildNROM(a.assemble(), Buffer.alloc(0));
}

const FIXTURES = {
  'solid.nes': buildSolid,
  'input.nes': buildInput,
  'sprites.nes': buildSprites,
  'metasprite.nes': buildMetasprite,
  'banked.nes': buildBanked,
  'animation.nes': buildAnimation,
  'chrram.nes': buildChrRam,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [name, build] of Object.entries(FIXTURES)) {
  const rom = build();
  fs.writeFileSync(path.join(OUT_DIR, name), rom);
  console.log(`${name}: ${rom.length} bytes`);
}
