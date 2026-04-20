const Emulator = require('../core/emulator');
const FileUtils = require('../utils/file');
const chalk = require('chalk');

class LoadCommand {
  constructor() {
    this.emulator = new Emulator();
  }

  execute(romPath, options = {}) {
    if (!require('fs').existsSync(romPath)) {
      console.error(chalk.red(`ROM not found: ${romPath}`));
      return false;
    }

    try {
      this.emulator.loadROM(romPath);
      console.log(chalk.green(`Loaded ROM: ${romPath}`));
      
      if (options.frames) {
        console.log(chalk.blue(`Running ${options.frames} frames...`));
        this.emulator.run(parseInt(options.frames));
        console.log(chalk.green(`Completed ${options.frames} frames`));
      }

      if (options.screenshot) {
        const ScreenshotCommand = require('./screenshot');
        const screenshot = new ScreenshotCommand(this.emulator);
        screenshot.execute({ output: options.screenshot });
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
