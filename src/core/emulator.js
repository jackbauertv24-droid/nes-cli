const jsnes = require('jsnes');
const fs = require('fs');
const { unpackRGB } = require('./color');
const ChrRecorder = require('./chr-recorder');

// The NES does not run at exactly 60Hz. Using the real rate keeps
// millisecond-to-frame conversions honest over long captures.
const NTSC_FPS = 60.0988;

// jsnes generates audio at whatever rate it is constructed with, and defaults
// to 48000. Anything that writes a WAV header has to agree with this value or
// the file plays back at the wrong pitch.
const DEFAULT_SAMPLE_RATE = 48000;

const BUTTONS = {
  A: jsnes.Controller.BUTTON_A,
  B: jsnes.Controller.BUTTON_B,
  SELECT: jsnes.Controller.BUTTON_SELECT,
  START: jsnes.Controller.BUTTON_START,
  UP: jsnes.Controller.BUTTON_UP,
  DOWN: jsnes.Controller.BUTTON_DOWN,
  LEFT: jsnes.Controller.BUTTON_LEFT,
  RIGHT: jsnes.Controller.BUTTON_RIGHT
};

class Emulator {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
    this.nes = new jsnes.NES({
      onFrame: this.onFrame.bind(this),
      onAudioSample: this.onAudioSample.bind(this),
      sampleRate: this.sampleRate
    });
    this.frameBuffer = null;
    this.audioBuffer = [];
    this.frameCount = 0;
    this.currentROM = null;
    this.chrRecorder = new ChrRecorder(this.nes);
  }

  onFrame(frameBuffer) {
    this.frameBuffer = frameBuffer;
    this.frameCount++;
  }

  onAudioSample(left) {
    this.audioBuffer.push(left);
  }

  loadROM(romPath) {
    const data = fs.readFileSync(romPath);
    this.nes.loadROM(data.toString('binary'));
    this.currentROM = romPath;
    this.frameCount = 0;
    this.audioBuffer = [];
    // The mapper only exists once a ROM is loaded.
    this.chrRecorder.install();
    // Render one frame so callers always have a framebuffer to work with.
    this.frame();
    return true;
  }

  frame() {
    this.chrRecorder.beginFrame();
    this.nes.frame();
  }

  stepFrame() {
    this.frame();
    return this.frameCount;
  }

  run(frames = 1) {
    for (let i = 0; i < frames; i++) {
      this.frame();
    }
  }

  static normalizeButton(button) {
    const name = String(button).toUpperCase();
    if (!(name in BUTTONS)) {
      throw new Error(`Unknown button "${button}". Valid: ${Object.keys(BUTTONS).join(', ')}`);
    }
    return name;
  }

  buttonDown(player, button) {
    this.nes.buttonDown(player, BUTTONS[Emulator.normalizeButton(button)]);
  }

  buttonUp(player, button) {
    this.nes.buttonUp(player, BUTTONS[Emulator.normalizeButton(button)]);
  }

  getFrameBuffer() {
    return this.frameBuffer;
  }

  /**
   * Restore a previously captured framebuffer.
   *
   * jsnes state does not include the rendered screen - restoring it leaves the
   * emulator's memory correct but the framebuffer showing whatever was drawn
   * last, which for a freshly constructed emulator is the power-on frame. A
   * screenshot taken straight after a restore would otherwise show a blank
   * screen rather than the game.
   */
  setFrameBuffer(buffer) {
    this.frameBuffer = buffer;
  }

  getNES() {
    return this.nes;
  }

  getAudioBuffer() {
    return this.audioBuffer;
  }

  clearAudioBuffer() {
    this.audioBuffer = [];
  }

  getState() {
    return {
      rom: this.currentROM,
      frameCount: this.frameCount,
      state: this.nes.toJSON()
    };
  }

  setState(state) {
    this.currentROM = state.rom;
    this.frameCount = state.frameCount;
    this.nes.fromJSON(state.state);
  }

  getCPUState() {
    return {
      pc: this.nes.cpu.REG_PC,
      sp: this.nes.cpu.REG_SP,
      a: this.nes.cpu.REG_ACC,
      x: this.nes.cpu.REG_X,
      y: this.nes.cpu.REG_Y,
      status: this.nes.cpu.REG_STATUS
    };
  }

  getPPUState() {
    return {
      frame: this.frameCount,
      scanline: this.nes.ppu.scanline,
      cycle: this.nes.ppu.curX,
      vramAddress: this.nes.ppu.vramAddress,
      tempAddress: this.nes.ppu.vramTmpAddress,
      spriteSize: this.is8x16Sprites() ? '8x16' : '8x8',
      spritePatternTable: this.getSpritePatternTable()
    };
  }

  getOAM() {
    return this.nes.ppu.spriteMem || new Uint8Array(256);
  }

  /**
   * Read a tile out of the PPU's *live* pattern tables.
   *
   * This is the key difference from reading CHR-ROM at a file offset. Mappers
   * that bank-switch CHR (MMC3, and most cartridges past the earliest ones)
   * copy the active bank into ppu.vramMem on every switch, so this reflects
   * what the PPU is actually drawing at this instant. Reading the ROM file
   * instead gives whichever bank happened to be loaded first, which is why
   * tile numbers appeared to "change meaning" during gameplay. It also works
   * for CHR-RAM games, which have no CHR data in the file at all.
   *
   * Cartridges that swap CHR banks partway down a frame - SMB3 does, to give
   * its status bar different tiles - need the third argument. Without it this
   * reads whatever is banked in at the frame boundary, which for such games is
   * the bottom strip's tiles rather than the playfield's.
   *
   * @param table 0 for $0000, 1 for $1000.
   * @param index 0-255 within that table.
   * @param screenY optional screen row; reads the banks active on that row.
   * @returns 64 colour indices (0-3), row-major.
   */
  getPatternTile(table, index, screenY) {
    const base = (table & 1) * 0x1000 + (index & 0xff) * 16;
    const recorded = screenY == null ? null : this.chrRecorder.chrForScreenRow(screenY);
    const vram = recorded || this.nes.ppu.vramMem;
    const pixels = new Array(64).fill(0);

    for (let y = 0; y < 8; y++) {
      const lowByte = vram[base + y] || 0;
      const highByte = vram[base + y + 8] || 0;
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x;
        pixels[y * 8 + x] = (((highByte >> bit) & 1) << 1) | ((lowByte >> bit) & 1);
      }
    }

    return pixels;
  }

  is8x16Sprites() {
    return this.nes.ppu.f_spriteSize === 1;
  }

  /**
   * Which pattern table 8x8 sprites come from (PPUCTRL bit 3).
   * In 8x16 mode this is ignored: bit 0 of each tile byte selects the table.
   */
  getSpritePatternTable() {
    return this.nes.ppu.f_spPatternTable === 1 ? 1 : 0;
  }

  /**
   * Resolve one OAM tile byte to the pattern-table tiles it draws.
   * @returns {{table: number, tiles: number[]}}
   */
  resolveSpriteTiles(tileByte) {
    if (this.is8x16Sprites()) {
      return { table: tileByte & 1, tiles: [tileByte & 0xfe, (tileByte & 0xfe) + 1] };
    }
    return { table: this.getSpritePatternTable(), tiles: [tileByte & 0xff] };
  }

  /**
   * The four colours of a sprite palette, as [r, g, b] triples.
   *
   * Entry 0 is the shared transparency slot: the NES draws nothing there, so
   * callers must treat index 0 as transparent rather than as a colour. It is
   * returned anyway (mirroring $3F00) for callers that want a matte.
   */
  getSpritePalette(paletteIndex) {
    const baseAddress = 0x3f10 + (paletteIndex & 3) * 4;
    const palTable = this.nes.ppu.palTable.curTable;
    const palette = [];

    for (let i = 0; i < 4; i++) {
      const address = i === 0 ? 0x3f00 : baseAddress + i;
      const colorIndex = this.nes.ppu.vramMem[address] & 63;
      palette.push(unpackRGB(palTable[colorIndex] || 0));
    }

    return palette;
  }

  getAllSpritePalettes() {
    return [0, 1, 2, 3].map((i) => this.getSpritePalette(i));
  }

  getBackgroundColor() {
    const palTable = this.nes.ppu.palTable.curTable;
    return unpackRGB(palTable[this.nes.ppu.vramMem[0x3f00] & 63] || 0);
  }

  getMemory(start, length) {
    const mem = [];
    for (let i = 0; i < length; i++) {
      mem.push(this.nes.cpu.mem[start + i]);
    }
    return mem;
  }
}

Emulator.BUTTONS = BUTTONS;
Emulator.NTSC_FPS = NTSC_FPS;
Emulator.DEFAULT_SAMPLE_RATE = DEFAULT_SAMPLE_RATE;

module.exports = Emulator;
