const GIFEncoder = require('gif-encoder-2');
const fs = require('fs');
const { unpackRGB } = require('../../core/color');

class GIFHandler {
  static createGIF(width = 256, height = 240, fps = 60) {
    const encoder = new GIFEncoder(width, height);
    encoder.setRepeat(0);
    // GIF stores delay in centiseconds, so anything faster than 100fps is
    // rounded; most viewers also clamp delays under 2cs. Callers wanting a
    // smooth GIF should drop to 30 or 20fps rather than asking for 60.
    encoder.setDelay(1000 / fps);
    encoder.start();
    return encoder;
  }

  static frameToRGBA(frameBuffer, width = 256, height = 240) {
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const packedColor = frameBuffer[idx] || 0;
        const [r, g, b] = unpackRGB(packedColor);
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