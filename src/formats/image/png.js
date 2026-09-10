const { PNG } = require('pngjs');
const fs = require('fs');
const { unpackRGB } = require('../../core/color');

class PNGHandler {
  static frameToPNG(frameBuffer, width = 256, height = 240) {
    const png = new PNG({ width, height });

    for (let i = 0; i < width * height; i++) {
      const [r, g, b] = unpackRGB(frameBuffer[i] || 0);
      const idx = i * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }

    return PNG.sync.write(png);
  }

  static save(frameBuffer, filePath, width = 256, height = 240) {
    fs.writeFileSync(filePath, this.frameToPNG(frameBuffer, width, height));
    return filePath;
  }

  /**
   * Write a sprite from NES colour indices.
   *
   * Index 0 is the PPU's transparency slot, so it is written as a fully
   * transparent pixel rather than as palette[0]. This is what makes extracted
   * sprites usable: previously every pixel was opaque, which meant the black
   * used for an outline (index 3) and the black behind the sprite (index 0)
   * were indistinguishable in the output.
   */
  static saveSprite(pixelData, filePath, palette, width = 8, height = 8) {
    const png = new PNG({ width, height });

    for (let i = 0; i < width * height; i++) {
      const pixel = pixelData[i] || 0;
      const [r, g, b] = palette[pixel] || [0, 0, 0];
      const idx = i * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = pixel === 0 ? 0 : 255;
    }

    fs.writeFileSync(filePath, PNG.sync.write(png));
    return filePath;
  }
}

module.exports = PNGHandler;
