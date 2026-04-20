const fs = require('fs');
const path = require('path');

class FileUtils {
  static ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  static getOutputPath(input, output, defaultName) {
    if (output) {
      return output;
    }
    const baseName = path.basename(input, path.extname(input));
    return `${baseName}_${defaultName}`;
  }

  static generateSequenceName(dir, prefix, index, ext) {
    const paddedIndex = String(index).padStart(3, '0');
    return path.join(dir, `${prefix}_${paddedIndex}.${ext}`);
  }
}

module.exports = FileUtils;
