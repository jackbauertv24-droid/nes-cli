const PNGHandler = require('../formats/image/png');
const ASCIIHandler = require('../formats/image/ascii');
const FileUtils = require('../utils/file');
const chalk = require('chalk');

class ScreenshotCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const frameBuffer = this.emulator.getFrameBuffer();
    
    if (!frameBuffer) {
      console.error(chalk.red('No frame captured yet. Run some frames first.'));
      return false;
    }

    const outputPath = options.output || FileUtils.getOutputPath(
      this.emulator.currentROM || 'screenshot',
      null,
      'screenshot.png'
    );

    const nes = this.emulator.getNES();
    const palTable = this.emulator.getPalTable();

    try {
      if (options.format === 'ascii') {
        ASCIIHandler.saveASCII(frameBuffer, palTable, outputPath, {
          width: 256,
          height: 240,
          scale: options.scale || 0.5
        });
        console.log(chalk.green(`ASCII screenshot saved: ${outputPath}`));
      } else if (options.format === 'ansi') {
        ASCIIHandler.saveANSI(frameBuffer, palTable, outputPath, {
          width: 256,
          height: 240,
          scale: options.scale || 0.25
        });
        console.log(chalk.green(`ANSI screenshot saved: ${outputPath}`));
      } else {
        PNGHandler.saveWithPalette(frameBuffer, palTable, outputPath);
        console.log(chalk.green(`Screenshot saved: ${outputPath}`));
      }
      
      return outputPath;
    } catch (error) {
      console.error(chalk.red(`Error saving screenshot: ${error.message}`));
      return false;
    }
  }
}

module.exports = ScreenshotCommand;
