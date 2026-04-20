const { PNG } = require('pngjs');
const fs = require('fs');

const NES_PALETTE = [
  [84, 84, 84], [0, 30, 116], [8, 16, 120], [48, 0, 136],
  [68, 0, 100], [92, 0, 48], [84, 4, 0], [60, 8, 0],
  [32, 16, 0], [8, 16, 0], [0, 24, 0], [0, 32, 12],
  [0, 32, 32], [0, 24, 40], [0, 16, 48], [0, 8, 56],
  [180, 180, 180], [24, 96, 192], [48, 72, 196],
  [104, 32, 168], [128, 32, 100], [152, 32, 48],
  [180, 36, 0], [140, 40, 0], [92, 48, 0], [56, 48, 0],
  [24, 56, 0], [0, 60, 0], [0, 60, 24], [0, 56, 48],
  [0, 48, 80], [0, 40, 100], [0, 32, 112], [252, 252, 252],
  [60, 188, 252], [92, 160, 252], [160, 120, 252],
  [184, 84, 252], [200, 60, 252], [216, 40, 240],
  [232, 32, 200], [208, 40, 120], [176, 48, 72],
  [140, 56, 40], [108, 64, 24], [72, 72, 0], [48, 80, 0],
  [32, 88, 0], [24, 96, 24], [24, 96, 64], [0, 104, 88],
  [0, 104, 120], [0, 96, 152], [0, 84, 180], [0, 76, 200],
  [0, 68, 220], [0, 60, 232], [84, 252, 252], [0, 232, 252],
  [0, 220, 252], [0, 200, 252], [0, 180, 252], [0, 160, 252],
  [0, 144, 252], [0, 132, 252], [0, 116, 252], [0, 100, 252]
];

class PNGHandler {
  static getRGBColor(colorIndex) {
    const packed = colorIndex;
    const r = (packed >> 16) & 0xFF;
    const g = (packed >> 8) & 0xFF;
    const b = packed & 0xFF;
    return [r, g, b];
  }

  static frameToPNG(frameBuffer, nes, width = 256, height = 240) {
    const png = new PNG({ width, height });
    const palTable = nes ? nes.ppu.palTable.curTable : null;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pixelIndex = frameBuffer[idx] || 0;
        const pngIdx = (y * width + x) * 4;
        
        if (palTable && palTable[pixelIndex]) {
          const [r, g, b] = this.getRGBColor(palTable[pixelIndex]);
          png.data[pngIdx] = r;
          png.data[pngIdx + 1] = g;
          png.data[pngIdx + 2] = b;
          png.data[pngIdx + 3] = 255;
        } else {
          const color = NES_PALETTE[pixelIndex] || [0, 0, 0];
          png.data[pngIdx] = color[0];
          png.data[pngIdx + 1] = color[1];
          png.data[pngIdx + 2] = color[2];
          png.data[pngIdx + 3] = 255;
        }
      }
    }
    
    return PNG.sync.write(png);
  }

  static save(frameBuffer, filePath, nes, width = 256, height = 240) {
    const buffer = this.frameToPNG(frameBuffer, nes, width, height);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  static saveWithPalette(frameBuffer, palTable, filePath, width = 256, height = 240) {
    const png = new PNG({ width, height });
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const pixelIndex = frameBuffer[idx] || 0;
        const pngIdx = (y * width + x) * 4;
        
        if (palTable && palTable[pixelIndex]) {
          const [r, g, b] = this.getRGBColor(palTable[pixelIndex]);
          png.data[pngIdx] = r;
          png.data[pngIdx + 1] = g;
          png.data[pngIdx + 2] = b;
          png.data[pngIdx + 3] = 255;
        } else {
          const color = NES_PALETTE[pixelIndex] || [0, 0, 0];
          png.data[pngIdx] = color[0];
          png.data[pngIdx + 1] = color[1];
          png.data[pngIdx + 2] = color[2];
          png.data[pngIdx + 3] = 255;
        }
      }
    }
    
    fs.writeFileSync(filePath, PNG.sync.write(png));
    return filePath;
  }

  static spriteToPNG(spriteData, width, height, palette) {
    const png = new PNG({ width, height });
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const pixel = spriteData[y * width + x];
        const color = palette[pixel] || [0, 0, 0];
        
        png.data[idx] = color[0];
        png.data[idx + 1] = color[1];
        png.data[idx + 2] = color[2];
        png.data[idx + 3] = pixel === 0 ? 0 : 255;
      }
    }
    
    return PNG.sync.write(png);
  }
}

module.exports = PNGHandler;