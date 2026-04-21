const jsnes = require('jsnes');
const fs = require('fs');

class Emulator {
  constructor() {
    this.nes = new jsnes.NES({
      onFrame: this.onFrame.bind(this),
      onAudioSample: this.onAudioSample.bind(this)
    });
    this.frameBuffer = null;
    this.palTable = null;
    this.audioBuffer = [];
    this.running = false;
    this.frameCount = 0;
    this.currentROM = null;
  }

  onFrame(frameBuffer) {
    this.frameBuffer = frameBuffer;
    this.palTable = this.nes.ppu.palTable.curTable;
    this.frameCount++;
  }

  onAudioSample(left, right) {
    this.audioBuffer.push(left);
  }

  loadROM(path) {
    const data = fs.readFileSync(path);
    this.nes.loadROM(data.toString('binary'));
    // Fix palette after ROM loads (jsnes resets to NTSC on load)
    this.nes.ppu.palTable.loadDefaultPalette();
    this.currentROM = path;
    this.frameCount = 0;
    this.audioBuffer = [];
    return true;
  }

  frame() {
    this.nes.frame();
  }

  stepFrame() {
    this.nes.frame();
    return this.frameCount;
  }

  run(frames = 1) {
    for (let i = 0; i < frames; i++) {
      this.nes.frame();
    }
  }

  buttonDown(player, button) {
    this.nes.buttonDown(player, jsnes.Controller[button]);
  }

  buttonUp(player, button) {
    this.nes.buttonUp(player, jsnes.Controller[button]);
  }

  getFrameBuffer() {
    return this.frameBuffer;
  }

  getNES() {
    return this.nes;
  }

  getPalTable() {
    return this.palTable || this.nes.ppu.palTable.curTable;
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
      frame: this.nes.ppu.frame || 0,
      scanline: this.nes.ppu.scanline,
      cycle: this.nes.ppu.curX,
      vramAddress: this.nes.ppu.vramAddress,
      tempAddress: this.nes.ppu.vramTmpAddress
    };
  }

  getOAM() {
    return this.nes.ppu.spriteMem || new Uint8Array(256);
  }

  getSpriteData() {
    const sprites = [];
    for (let i = 0; i < 64; i++) {
      sprites.push({
        id: i,
        x: this.nes.ppu.sprX[i] || 0,
        y: this.nes.ppu.sprY[i] || 0,
        tile: this.nes.ppu.sprTile[i] || 0,
        attributes: this.nes.ppu.sprCol[i] || 0
      });
    }
    return sprites;
  }

  getSpritePalette(paletteIndex) {
    const baseAddress = 0x3F10 + (paletteIndex * 4);
    const palette = [];
    const palTable = this.nes.ppu.palTable.curTable;
    for (let i = 0; i < 4; i++) {
      const colorIndex = this.nes.ppu.vramMem[baseAddress + i] & 63;
      const rgb = palTable[colorIndex] || 0;
      palette.push([
        (rgb >> 16) & 0xFF,
        (rgb >> 8) & 0xFF,
        rgb & 0xFF
      ]);
    }
    return palette;
  }

  getAllSpritePalettes() {
    return [0, 1, 2, 3].map(i => this.getSpritePalette(i));
  }

  is8x16Sprites() {
    return this.nes.ppu.f_spriteSize === 1;
  }

  getTilePixelData(tileIndex) {
    const tile = this.nes.ppu.ptTile[tileIndex];
    if (!tile) return new Array(64).fill(0);
    
    const pixelData = new Array(64).fill(0);
    for (let y = 0; y < 8; y++) {
      const lowByte = tile.pix[y] || 0;
      const highByte = tile.pix[y + 8] || 0;
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x;
        const lowBit = (lowByte >> bit) & 1;
        const highBit = (highByte >> bit) & 1;
        pixelData[y * 8 + x] = (highBit << 1) | lowBit;
      }
    }
    return pixelData;
  }

  getMemory(start, length) {
    const mem = [];
    for (let i = 0; i < length; i++) {
      mem.push(this.nes.cpu.mem[start + i]);
    }
    return mem;
  }
}

module.exports = Emulator;
