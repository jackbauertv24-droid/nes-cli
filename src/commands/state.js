const StateManager = require('../core/state');
const chalk = require('chalk');

class SaveStateCommand {
  constructor(emulator) {
    this.emulator = emulator;
    this.stateManager = new StateManager();
  }

  execute(options = {}) {
    const state = this.emulator.getState();
    
    if (options.slot) {
      this.stateManager.quickSave(options.slot, state);
      console.log(chalk.green(`State saved to slot ${options.slot}`));
      return options.slot;
    }

    const outputPath = options.output || 'state.json';
    this.stateManager.save(state, outputPath);
    console.log(chalk.green(`State saved: ${outputPath}`));
    return outputPath;
  }
}

class LoadStateCommand {
  constructor(emulator) {
    this.emulator = emulator;
    this.stateManager = new StateManager();
  }

  execute(options = {}) {
    if (options.slot) {
      const state = this.stateManager.quickLoad(options.slot);
      if (!state) {
        console.error(chalk.red(`No state in slot ${options.slot}`));
        return false;
      }
      this.emulator.setState(state);
      console.log(chalk.green(`State loaded from slot ${options.slot}`));
      return true;
    }

    const inputPath = options.input || 'state.json';
    const state = this.stateManager.load(inputPath);
    this.emulator.setState(state);
    console.log(chalk.green(`State loaded: ${inputPath}`));
    return true;
  }
}

module.exports = { SaveStateCommand, LoadStateCommand };
