const StateManager = require('../core/state');
const chalk = require('chalk');
const fs = require('fs');

class SaveStateCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const outputPath = options.output || 'state.json';
    StateManager.save(this.emulator.getState(), outputPath);
    console.log(chalk.green(`State saved: ${outputPath}`));
    return outputPath;
  }
}

class LoadStateCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const inputPath = options.input || 'state.json';

    if (!fs.existsSync(inputPath)) {
      console.error(chalk.red(`State file not found: ${inputPath}`));
      return false;
    }

    this.emulator.setState(StateManager.load(inputPath));
    console.log(chalk.green(`State loaded: ${inputPath}`));
    return true;
  }
}

module.exports = { SaveStateCommand, LoadStateCommand };
