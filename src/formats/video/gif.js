const GIFEncoder = require('gif-encoder-2');
const fs = require('fs');

class GIFHandler {
  static unpackRGB(packed) {
    const r = (packed >> 16) & 0xFF;
    const g = (packed >> 8) & 0xFF;
    const b = packed & 0xFF;
    return [r, g, b];
  }

  static createGIF(width = 256, height = 240) {
    const encoder = new GIFEncoder(width, height);
    encoder.setRepeat(0);
    encoder.setDelay(1000 / 60);
    encoder.start();
    return encoder;
  }

  static frameToRGBA(frameBuffer, width = 256, height = 240) {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const packedColor = frameBuffer[idx] || 0;
        const [r, g, b] = this.unpackRGB(packedColor);
        const rgbaIdx = idx * 4;
        rgba[rgbaIdx] = r;
        rgba[rgbaIdx + 1] = g;
        rgba[rgbaIdx + 2] = b;
        rgba[rgbaIdx + 3] = 255;
      }
    }
    return rgba;
  }

  static addFrame(encoder, frameBuffer, width = 256, height = 240) {
    const rgba = this.frameToRGBA(frameBuffer, width, height);
    encoder.addFrame(rgba);
  }

  static save(encoder, filePath) {
    encoder.finish();
    const buffer = encoder.out.getData();
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
}

module.exports = GIFHandler;