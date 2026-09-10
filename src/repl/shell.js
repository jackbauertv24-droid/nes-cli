const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const LoadCommand = require('../commands/load');
const { RunCommand, StepCommand } = require('../commands/run');
const ScreenshotCommand = require('../commands/screenshot');
const RecordCommand = require('../commands/record');
const InputCommand = require('../commands/input');
const SpritesCommand = require('../commands/sprites');
const AudioCommand = require('../commands/audio');
const { SaveStateCommand, LoadStateCommand } = require('../commands/state');
const DumpCommand = require('../commands/dump');

/**
 * One emulator, many commands, one process.
 *
 * Both the interactive REPL and `nes-cli script` run through this dispatcher,
 * so the two cannot drift apart, and neither pays the cost of serialising
 * emulator state between steps the way the standalone subcommands do.
 */
class REPLShell {
  constructor() {
    this.emulator = null;
    this.running = true;
  }

  adopt(emulator) {
    this.emulator = emulator;
  }

  async start() {
    console.log(chalk.cyan('nes-cli - type "help" for commands, "exit" to quit'));

    while (this.running) {
      const { command } = await inquirer.prompt([
        { type: 'input', name: 'command', message: chalk.magenta('nes-cli>'), prefix: '' }
      ]);
      await this.execute(command.trim());
    }
  }

  async execute(line) {
    if (!line) return;
    const [cmd, ...args] = line.split(/\s+/);
    return this.executeSync(cmd, args);
  }

  requireEmulator() {
    if (!this.emulator) {
      console.log(chalk.red('Load a ROM first: load <rom.nes>'));
      return false;
    }
    return true;
  }

  executeSync(cmd, args = []) {
    const name = String(cmd || '').toLowerCase();

    try {
      switch (name) {
        case 'help':
        case '?':
          return this.showHelp();

        case 'exit':
        case 'quit':
        case 'q':
          this.running = false;
          return true;

        case 'load': {
          if (args.length < 1) {
            console.log(chalk.red('Usage: load <rom.nes>'));
            return false;
          }
          const loadCmd = new LoadCommand();
          if (!loadCmd.execute(args[0])) return false;
          this.emulator = loadCmd.getEmulator();
          return true;
        }

        case 'run':
          return this.requireEmulator() &&
            new RunCommand(this.emulator).execute({ frames: args[0] || 60 });

        case 'step':
          return this.requireEmulator() &&
            new StepCommand(this.emulator).execute({ frames: args[0] || 1 });

        case 'screenshot': {
          if (!this.requireEmulator()) return false;
          const output = args[0];
          const explicit = args[1];
          const ext = output ? path.extname(output).toLowerCase() : '.png';
          const format = explicit || (ext === '.txt' ? 'ascii' : ext === '.ansi' ? 'ansi' : 'png');
          return new ScreenshotCommand(this.emulator).execute({ output, format });
        }

        case 'record':
          return this.requireEmulator() &&
            new RecordCommand(this.emulator).execute({
              format: args[0] || 'gif',
              duration: args[1] || '5s',
              output: args[2],
              fps: args[3]
            });

        case 'input':
          return this.requireEmulator() &&
            new InputCommand(this.emulator).execute({
              button: args[0],
              holdFrames: args[1]
            });

        case 'sequence':
          return this.requireEmulator() &&
            new InputCommand(this.emulator).execute({ sequence: args[0] });

        case 'sprites': {
          if (!this.requireEmulator()) return false;
          const formats = ['chr', 'oam', 'metasprite', 'animation', 'all'];
          return new SpritesCommand(this.emulator).execute({
            format: args.find((a) => formats.includes(a)) || 'all',
            outputDir: args.find((a) => !formats.includes(a) && !a.includes('=')) || './sprites',
            frames: parseInt(args.find((a) => a.startsWith('frames='))?.split('=')[1], 10) || 60
          });
        }

        case 'audio':
          // Duration first, matching how it is nearly always used:
          //   audio 10s out.wav
          return this.requireEmulator() &&
            new AudioCommand(this.emulator).execute({
              duration: args[0] || '10s',
              output: args[1],
              format: args[2] || 'wav'
            });

        case 'save':
        case 'save-state':
          return this.requireEmulator() &&
            new SaveStateCommand(this.emulator).execute({ output: args[0] || 'state.json' });

        case 'load-state':
          return this.requireEmulator() &&
            new LoadStateCommand(this.emulator).execute({ input: args[0] || 'state.json' });

        case 'dump': {
          if (!this.requireEmulator()) return false;
          const dump = new DumpCommand(this.emulator);
          if (args.includes('oam')) return dump.execute({ oam: true });
          if (args.includes('mem')) {
            return dump.execute({ memory: true, range: args[args.indexOf('mem') + 1] });
          }
          if (args.includes('cpu')) return dump.execute({ cpuRegisters: true });
          if (args.includes('ppu')) return dump.execute({ ppuRegisters: true });
          return dump.execute({});
        }

        default:
          console.log(chalk.red(`Unknown command: ${name}. Type "help".`));
          return false;
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      return false;
    }
  }

  showHelp() {
    console.log(chalk.cyan('\nCommands:'));
    console.log('  load <rom.nes>                Load a ROM');
    console.log('  run [frames]                  Run N frames (default 60)');
    console.log('  step [frames]                 Step N frames (default 1)');
    console.log('  screenshot [file] [format]    Capture a frame (png, ascii, ansi)');
    console.log('  record [format] [dur] [file] [fps]');
    console.log('  input <button> [holdFrames]   A B SELECT START UP DOWN LEFT RIGHT');
    console.log('  sequence <a,b,start>          Press several buttons in turn');
    console.log('  sprites [format] [dir]        chr, oam, metasprite, all');
    console.log('  audio [dur] [file] [format]   format: wav, pcm, json');
    console.log('  save [file] / load-state [file]');
    console.log('  dump [cpu|ppu|oam|mem <range>]');
    console.log('  exit\n');
    return true;
  }
}

module.exports = REPLShell;
