const c = require('ansi-colors');

class ASCIIHandler {
  static unpackRGB(packed) {
    const r = (packed >> 16) & 0xFF;
    const g = (packed >> 8) & 0xFF;
    const b = packed & 0xFF;
    return [r, g, b];
  }

  static getAsciiChar(brightness) {
    const chars = ' .:-=+*#%@';
    const index = Math.floor((brightness / 255) * (chars.length - 1));
    return chars[Math.min(index, chars.length - 1)];
  }

  static frameToASCII(frameBuffer, width = 256, height = 240, scale = 0.5) {
    const outWidth = Math.floor(width * scale);
    const outHeight = Math.floor(height * scale);
    let output = '';
    
    for (let y = 0; y < outHeight; y++) {
      let line = '';
      for (let x = 0; x < outWidth; x++) {
        const srcX = Math.floor(x / scale);
        const srcY = Math.floor(y / scale);
        const idx = srcY * width + srcX;
        
        const packedColor = frameBuffer[idx] || 0;
        const [r, g, b] = this.unpackRGB(packedColor);
        const brightness = (r + g + b) / 3;
        
        line += this.getAsciiChar(brightness);
      }
      output += line + '\n';
    }
    
    return output;
  }

  static frameToANSI(frameBuffer, width = 256, height = 240, scale = 0.25) {
    const outWidth = Math.floor(width * scale);
    const outHeight = Math.floor(height * scale);
    let output = '';
    
    for (let y = 0; y < outHeight; y++) {
      let line = '';
      for (let x = 0; x < outWidth; x++) {
        const srcX = Math.floor(x / scale);
        const srcY = Math.floor(y / scale);
        const idx = srcY * width + srcX;
        
        const packedColor = frameBuffer[idx] || 0;
        const [r, g, b] = this.unpackRGB(packedColor);
        
        line += c.rgb(r, g, b)('\u2588');
      }
      output += line + '\n';
    }
    
    return output;
  }

  static saveASCII(frameBuffer, filePath, options = {}) {
    const fs = require('fs');
    const ascii = this.frameToASCII(frameBuffer, options.width || 256, options.height || 240, options.scale || 0.5);
    fs.writeFileSync(filePath, ascii);
    return filePath;
  }

  static saveANSI(frameBuffer, filePath, options = {}) {
    const fs = require('fs');
    const ansi = this.frameToANSI(frameBuffer, options.width || 256, options.height || 240, options.scale || 0.25);
    fs.writeFileSync(filePath, ansi);
    return filePath;
  }
}

module.exports = ASCIIHandler;