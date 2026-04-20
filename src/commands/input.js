const chalk = require('chalk');

class InputCommand {
  constructor(emulator) {
    this.emulator = emulator;
    this.validButtons = ['A', 'B', 'SELECT', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
  }

  execute(options = {}) {
    if (options.button) {
      return this.pressButton(options.button, options);
    }

    if (options.sequence) {
      return this.executeSequence(options.sequence, options);
    }

    console.error(chalk.red('No input specified. Use --button or --sequence'));
    return false;
  }

  pressButton(button, options = {}) {
    button = button.toUpperCase();
    
    if (!this.validButtons.includes(button)) {
      console.error(chalk.red(`Invalid button: ${button}. Valid: ${this.validButtons.join(', ')}`));
      return false;
    }

    const player = parseInt(options.player) || 1;
    
    if (options.hold) {
      const duration = parseInt(options.duration) || 500;
      const frames = Math.floor(duration / 16.67); // ~60fps
      
      console.log(chalk.blue(`Holding ${button} for ${duration}ms (${frames} frames)...`));
      this.emulator.buttonDown(player, button);
      this.emulator.run(frames);
      this.emulator.buttonUp(player, button);
      console.log(chalk.green(`Released ${button}`));
    } else {
      console.log(chalk.blue(`Pressing ${button}...`));
      this.emulator.buttonDown(player, button);
      this.emulator.run(1);
      this.emulator.buttonUp(player, button);
      console.log(chalk.green(`Pressed ${button}`));
    }

    return true;
  }

  async executeSequence(sequence, options = {}) {
    const buttons = sequence.split(',').map(b => b.trim().toUpperCase());
    const delay = parseInt(options.delay) || 100;
    const delayFrames = Math.floor(delay / 16.67);

    console.log(chalk.blue(`Executing sequence: ${buttons.join(' -> ')}`));

    for (const button of buttons) {
      if (!this.validButtons.includes(button)) {
        console.error(chalk.red(`Invalid button in sequence: ${button}`));
        continue;
      }

      this.pressButton(button, { player: options.player });
      
      if (delay > 0) {
        this.emulator.run(delayFrames);
      }
    }

    console.log(chalk.green('Sequence complete'));
    return true;
  }
}

module.exports = InputCommand;
