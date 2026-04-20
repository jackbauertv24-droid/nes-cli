const PNGHandler = require('../formats/image/png');
const GIFHandler = require('../formats/video/gif');
const ASCIIHandler = require('../formats/image/ascii');
const FileUtils = require('../utils/file');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

class RecordCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const format = options.format || 'png-sequence';
    const duration = this.parseDuration(options.duration || '5s');
    const fps = parseInt(options.fps) || 60;
    const totalFrames = Math.floor(duration * fps);
    
    console.log(chalk.blue(`Recording ${totalFrames} frames (${duration}s @ ${fps}fps)...`));

    switch (format) {
      case 'png-sequence':
        return this.recordPNGSequence(totalFrames, options);
      case 'gif':
        return this.recordGIF(totalFrames, options);
      case 'ascii':
        return this.recordASCII(totalFrames, options);
      case 'ansi':
        return this.recordANSI(totalFrames, options);
      default:
        console.error(chalk.red(`Unknown format: ${format}`));
        return false;
    }
  }

  parseDuration(duration) {
    const match = duration.match(/^(\d+)(s|ms)$/);
    if (!match) return 5;
    const value = parseInt(match[1]);
    const unit = match[2];
    return unit === 'ms' ? value / 1000 : value;
  }

  getPalTable() {
    return this.emulator.getPalTable();
  }

  recordPNGSequence(totalFrames, options) {
    const outputDir = options.output || './frames';
    FileUtils.ensureDir(outputDir);
    const nes = this.emulator.getNES();

    for (let i = 0; i < totalFrames; i++) {
      this.emulator.frame();
      const frameBuffer = this.emulator.getFrameBuffer();
      const fileName = FileUtils.generateSequenceName(outputDir, 'frame', i + 1, 'png');
      PNGHandler.save(frameBuffer, nes, fileName);
      
      if ((i + 1) % 60 === 0) {
        console.log(chalk.blue(`  ${i + 1}/${totalFrames} frames...`));
      }
    }

    console.log(chalk.green(`PNG sequence saved to: ${outputDir}`));
    return outputDir;
  }

  recordGIF(totalFrames, options) {
    const outputPath = options.output || 'recording.gif';
    const palTable = this.getPalTable();
    const encoder = GIFHandler.createGIF(256, 240);

    for (let i = 0; i < totalFrames; i++) {
      this.emulator.frame();
      const frameBuffer = this.emulator.getFrameBuffer();
      GIFHandler.addFrame(encoder, frameBuffer, palTable);
      
      if ((i + 1) % 60 === 0) {
        console.log(chalk.blue(`  ${i + 1}/${totalFrames} frames...`));
      }
    }

    GIFHandler.save(encoder, outputPath);
    console.log(chalk.green(`GIF saved: ${outputPath}`));
    return outputPath;
  }

  recordASCII(totalFrames, options) {
    const outputPath = options.output || 'recording.txt';
    const palTable = this.getPalTable();
    let output = '';
    const scale = options.scale || 0.5;

    for (let i = 0; i < totalFrames; i++) {
      this.emulator.frame();
      const frameBuffer = this.emulator.getFrameBuffer();
      output += `=== Frame ${i + 1} ===\n`;
      output += ASCIIHandler.frameToASCII(frameBuffer, palTable, 256, 240, scale);
      output += '\n';
      
      if ((i + 1) % 60 === 0) {
        console.log(chalk.blue(`  ${i + 1}/${totalFrames} frames...`));
      }
    }

    fs.writeFileSync(outputPath, output);
    console.log(chalk.green(`ASCII recording saved: ${outputPath}`));
    return outputPath;
  }

  recordANSI(totalFrames, options) {
    const outputPath = options.output || 'recording.ansi';
    const palTable = this.getPalTable();
    let output = '';
    const scale = options.scale || 0.25;

    for (let i = 0; i < totalFrames; i++) {
      this.emulator.frame();
      const frameBuffer = this.emulator.getFrameBuffer();
      output += `=== Frame ${i + 1} ===\n`;
      output += ASCIIHandler.frameToANSI(frameBuffer, palTable, 256, 240, scale);
      output += '\n';
      
      if ((i + 1) % 60 === 0) {
        console.log(chalk.blue(`  ${i + 1}/${totalFrames} frames...`));
      }
    }

    fs.writeFileSync(outputPath, output);
    console.log(chalk.green(`ANSI recording saved: ${outputPath}`));
    return outputPath;
  }
}

module.exports = RecordCommand;