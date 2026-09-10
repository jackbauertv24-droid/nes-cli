const chalk = require('chalk');
const Emulator = require('../core/emulator');

// A single-frame tap is unreliable: many games poll the controller once per
// frame during NMI, and a press that goes down and up between two calls to
// frame() can be missed entirely. Three frames is comfortably inside the
// shortest human tap and is seen by every polling scheme.
const DEFAULT_PRESS_FRAMES = 3;

class InputCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    if (options.sequence) {
      return this.executeSequence(options.sequence, options);
    }
    if (options.button) {
      return this.pressButton(options.button, options);
    }

    console.error(chalk.red('No input specified. Give a button or --sequence.'));
    return false;
  }

  /** Convert --duration/--hold-frames into a frame count. */
  holdFrames(options) {
    if (options.holdFrames) {
      return Math.max(1, parseInt(options.holdFrames, 10));
    }
    if (options.duration) {
      return Math.max(1, Math.round((parseInt(options.duration, 10) / 1000) * Emulator.NTSC_FPS));
    }
    return DEFAULT_PRESS_FRAMES;
  }

  pressButton(button, options = {}) {
    let name;
    try {
      name = Emulator.normalizeButton(button);
    } catch (error) {
      console.error(chalk.red(error.message));
      return false;
    }

    const player = parseInt(options.player, 10) || 1;
    const frames = this.holdFrames(options);

    this.emulator.buttonDown(player, name);
    this.emulator.run(frames);
    this.emulator.buttonUp(player, name);
    // Let go for a frame so consecutive presses of the same button register as
    // two presses rather than one long hold.
    this.emulator.run(1);

    console.log(chalk.green(`Pressed ${name} for ${frames} frame(s)`));
    return true;
  }

  executeSequence(sequence, options = {}) {
    const buttons = String(sequence)
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    const gapFrames = options.delay
      ? Math.max(0, Math.round((parseInt(options.delay, 10) / 1000) * Emulator.NTSC_FPS))
      : 6;

    console.log(chalk.blue(`Sequence: ${buttons.join(' -> ')}`));

    for (const button of buttons) {
      if (!this.pressButton(button, options)) {
        return false;
      }
      if (gapFrames > 0) {
        this.emulator.run(gapFrames);
      }
    }

    console.log(chalk.green('Sequence complete'));
    return true;
  }
}

module.exports = InputCommand;
