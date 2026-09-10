const PNGHandler = require('../formats/image/png');
const GIFHandler = require('../formats/video/gif');
const ASCIIHandler = require('../formats/image/ascii');
const FileUtils = require('../utils/file');
const { parseDurationFrames, framesToSeconds } = require('../utils/duration');
const chalk = require('chalk');
const fs = require('fs');

class RecordCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  /**
   * Record the screen.
   *
   * `duration` is always emulated time, and `fps` is the playback rate of the
   * output. The emulator still runs every frame; frames are sampled down to
   * the requested rate so a 30fps GIF of 10 seconds contains 300 images of
   * 10 seconds of gameplay. Previously --fps only multiplied the frame count,
   * so it changed how much was captured rather than how fast it played.
   */
  execute(options = {}) {
    const format = options.format || 'gif';
    const fps = parseFloat(options.fps) || 30;
    let totalFrames;

    try {
      totalFrames = parseDurationFrames(options.duration || '5s');
    } catch (error) {
      console.error(chalk.red(error.message));
      return false;
    }

    const stride = Math.max(1, Math.round(60 / fps));
    const captured = Math.ceil(totalFrames / stride);

    console.log(
      chalk.blue(
        `Recording ${framesToSeconds(totalFrames).toFixed(2)}s ` +
          `(${totalFrames} emulated frames -> ${captured} at ${fps}fps)...`
      )
    );

    const sink = this.createSink(format, options, fps);
    if (!sink) {
      console.error(chalk.red(`Unknown format: ${format}`));
      return false;
    }

    let index = 0;
    for (let i = 0; i < totalFrames; i++) {
      this.emulator.frame();
      if (i % stride !== 0) continue;

      sink.add(this.emulator.getFrameBuffer(), index);
      index += 1;

      if (index % 60 === 0) {
        console.log(chalk.blue(`  ${index}/${captured} frames...`));
      }
    }

    const output = sink.finish();
    console.log(chalk.green(`Recording saved: ${output}`));
    return output;
  }

  createSink(format, options, fps) {
    const scale = options.scale || 0.5;

    if (format === 'png-sequence') {
      const outputDir = options.output || './frames';
      FileUtils.ensureDir(outputDir);
      return {
        add: (fb, i) => PNGHandler.save(fb, FileUtils.generateSequenceName(outputDir, 'frame', i + 1, 'png')),
        finish: () => outputDir
      };
    }

    if (format === 'gif') {
      const outputPath = options.output || 'recording.gif';
      const encoder = GIFHandler.createGIF(256, 240, fps);
      return {
        add: (fb) => GIFHandler.addFrame(encoder, fb),
        finish: () => GIFHandler.save(encoder, outputPath)
      };
    }

    if (format === 'ascii' || format === 'ansi') {
      const outputPath = options.output || `recording.${format === 'ascii' ? 'txt' : 'ansi'}`;
      const render = format === 'ascii'
        ? (fb) => ASCIIHandler.frameToASCII(fb, 256, 240, scale)
        : (fb) => ASCIIHandler.frameToANSI(fb, 256, 240, options.scale || 0.25);
      const chunks = [];
      return {
        add: (fb, i) => chunks.push(`=== Frame ${i + 1} ===\n${render(fb)}\n`),
        finish: () => {
          fs.writeFileSync(outputPath, chunks.join(''));
          return outputPath;
        }
      };
    }

    return null;
  }
}

module.exports = RecordCommand;
