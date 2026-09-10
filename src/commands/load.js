const Emulator = require('../core/emulator');
const chalk = require('chalk');
const fs = require('fs');

class LoadCommand {
  constructor() {
    this.emulator = new Emulator();
  }

  execute(romPath, options = {}) {
    if (!fs.existsSync(romPath)) {
      console.error(chalk.red(`ROM not found: ${romPath}`));
      return false;
    }

    try {
      this.emulator.loadROM(romPath);
      console.log(chalk.green(`Loaded ROM: ${romPath}`));

      if (options.frames) {
        const frames = parseInt(options.frames, 10);
        this.emulator.run(frames);
        console.log(chalk.green(`Ran ${frames} frames`));
      }

      if (options.screenshot) {
        const ScreenshotCommand = require('./screenshot');
        new ScreenshotCommand(this.emulator).execute({ output: options.screenshot });
      }

      return true;
    } catch (error) {
      console.error(chalk.red(`Error loading ROM: ${error.message}`));
      return false;
    }
  }

  getEmulator() {
    return this.emulator;
  }
}

module.exports = LoadCommand;
