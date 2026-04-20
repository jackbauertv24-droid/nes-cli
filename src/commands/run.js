const chalk = require('chalk');

class RunCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const frames = parseInt(options.frames) || 60;
    console.log(chalk.blue(`Running ${frames} frames...`));
    this.emulator.run(frames);
    console.log(chalk.green(`Completed ${frames} frames (total: ${this.emulator.frameCount})`));
    return true;
  }
}

class StepCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const frames = parseInt(options.frames) || 1;
    this.emulator.run(frames);
    console.log(chalk.green(`Stepped ${frames} frame(s) (total: ${this.emulator.frameCount})`));
    return true;
  }
}

module.exports = { RunCommand, StepCommand };
