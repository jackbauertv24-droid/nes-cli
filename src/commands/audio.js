const WAVHandler = require('../formats/audio/wav');
const FileUtils = require('../utils/file');
const { parseDurationFrames, framesToSeconds } = require('../utils/duration');
const { JSONHandler } = require('../formats/data/json-csv');
const chalk = require('chalk');
const fs = require('fs');

class AudioCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const format = options.format || 'wav';
    let frames;

    try {
      frames = parseDurationFrames(options.duration || '10s');
    } catch (error) {
      console.error(chalk.red(error.message));
      return false;
    }

    // The rate is fixed when the emulator is constructed; it cannot be changed
    // per capture. Reporting it here beats writing a header that disagrees.
    const sampleRate = this.emulator.sampleRate;
    console.log(
      chalk.blue(
        `Recording ${frames} frames (${framesToSeconds(frames).toFixed(2)}s) at ${sampleRate}Hz...`
      )
    );

    this.emulator.clearAudioBuffer();
    for (let i = 0; i < frames; i++) {
      this.emulator.frame();
      if ((i + 1) % 300 === 0) {
        console.log(chalk.blue(`  ${i + 1}/${frames} frames...`));
      }
    }

    const samples = this.emulator.getAudioBuffer();
    const outputPath =
      options.output ||
      FileUtils.getOutputPath(this.emulator.currentROM || 'audio', null, `audio.${format}`);

    switch (format) {
      case 'wav':
        WAVHandler.writeWAV(samples, outputPath, sampleRate);
        break;
      case 'pcm':
        this.savePCM(samples, outputPath);
        break;
      case 'json':
        JSONHandler.save(
          {
            sampleRate,
            duration: samples.length / sampleRate,
            sampleCount: samples.length,
            samples: samples.slice(0, 1000)
          },
          outputPath
        );
        break;
      default:
        console.error(chalk.red(`Unknown format: ${format}`));
        return false;
    }

    console.log(chalk.green(`Audio saved: ${outputPath}`));
    console.log(
      chalk.gray(`  ${samples.length} samples, ${(samples.length / sampleRate).toFixed(2)}s`)
    );
    return outputPath;
  }

  savePCM(samples, filePath) {
    const buffer = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      buffer.writeInt16LE(Math.round(clamped * 32767), i * 2);
    }
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
}

module.exports = AudioCommand;
