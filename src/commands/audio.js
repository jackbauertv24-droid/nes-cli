const WAVHandler = require('../formats/audio/wav');
const FileUtils = require('../utils/file');
const chalk = require('chalk');

class AudioCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const format = options.format || 'wav';
    const duration = this.parseDuration(options.duration || '10s');
    const sampleRate = parseInt(options.sampleRate) || 44100;
    const fps = 60;
    const totalFrames = Math.floor(duration * fps);

    console.log(chalk.blue(`Recording audio for ${duration}s (${totalFrames} frames @ ${sampleRate}Hz)...`));

    this.emulator.clearAudioBuffer();

    for (let i = 0; i < totalFrames; i++) {
      this.emulator.frame();
      
      if ((i + 1) % 60 === 0) {
        console.log(chalk.blue(`  ${i + 1}/${totalFrames} frames...`));
      }
    }

    const samples = this.emulator.getAudioBuffer();
    const outputPath = options.output || FileUtils.getOutputPath(
      this.emulator.currentROM || 'audio',
      null,
      `audio.${format}`
    );

    switch (format) {
      case 'wav':
        WAVHandler.writeWAV(samples, outputPath, sampleRate);
        console.log(chalk.green(`WAV audio saved: ${outputPath}`));
        break;
      case 'pcm':
        this.savePCM(samples, outputPath);
        console.log(chalk.green(`PCM audio saved: ${outputPath}`));
        break;
      case 'json':
        this.saveJSON(samples, outputPath, sampleRate);
        console.log(chalk.green(`Audio JSON saved: ${outputPath}`));
        break;
      default:
        console.error(chalk.red(`Unknown format: ${format}`));
        return false;
    }

    console.log(chalk.gray(`  Duration: ${(samples.length / sampleRate).toFixed(2)}s`));
    console.log(chalk.gray(`  Samples: ${samples.length}`));
    return outputPath;
  }

  parseDuration(duration) {
    const match = duration.match(/^(\d+)(s|ms)$/);
    if (!match) return 10;
    const value = parseInt(match[1]);
    const unit = match[2];
    return unit === 'ms' ? value / 1000 : value;
  }

  savePCM(samples, filePath) {
    const buffer = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      buffer.writeInt16LE(Math.floor(sample * 32767), i * 2);
    }
    require('fs').writeFileSync(filePath, buffer);
    return filePath;
  }

  saveJSON(samples, filePath, sampleRate) {
    const { JSONHandler } = require('../formats/data/json-csv');
    JSONHandler.save({
      sampleRate,
      duration: samples.length / sampleRate,
      sampleCount: samples.length,
      samples: samples.slice(0, 1000) // First 1000 samples as preview
    }, filePath);
    return filePath;
  }
}

module.exports = AudioCommand;
