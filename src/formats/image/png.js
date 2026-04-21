const { PNG } = require('pngjs');
const fs = require('fs');

class PNGHandler {
  static unpackRGB(packed) {
    const r = (packed >> 16) & 0xFF;
    const g = (packed >> 8) & 0xFF;
    const b = packed & 0xFF;
    return [r, g, b];
  }

  static frameToPNG(frameBuffer, width = 256, height = 240) {
    const png = new PNG({ width, height });
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const packedColor = frameBuffer[idx] || 0;
        const [r, g, b] = this.unpackRGB(packedColor);
        const pngIdx = idx * 4;
        
        png.data[pngIdx] = r;
        png.data[pngIdx + 1] = g;
        png.data[pngIdx + 2] = b;
        png.data[pngIdx + 3] = 255;
      }
    }
    
    return PNG.sync.write(png);
  }

  static save(frameBuffer, filePath, width = 256, height = 240) {
    const buffer = this.frameToPNG(frameBuffer, width, height);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  static saveWithPalette(frameBuffer, palTable, filePath, width = 256, height = 240) {
    return this.save(frameBuffer, filePath, width, height);
  }

  static spriteToPNG(spriteData, width, height, palette) {
    const png = new PNG({ width, height });
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = spriteData[y * width + x];
        const color = palette[pixel] || [0, 0, 0];
        const idx = (y * width + x) * 4;
        
        png.data[idx] = color[0];
        png.data[idx + 1] = color[1];
        png.data[idx + 2] = color[2];
        png.data[idx + 3] = pixel === 0 ? 0 : 255;
      }
    }
    
    return PNG.sync.write(png);
  }

  static saveSprite(pixelData, filePath, palette, width = 8, height = 8) {
    const png = new PNG({ width, height });
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = pixelData[y * width + x];
        const [r, g, b] = palette[pixel] || [0, 0, 0];
        const idx = (y * width + x) * 4;
        
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = pixel === 0 ? 0 : 255;
      }
    }
    
    fs.writeFileSync(filePath, PNG.sync.write(png));
    return filePath;
  }
}

module.exports = PNGHandler;