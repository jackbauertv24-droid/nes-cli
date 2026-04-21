const inquirer = require('inquirer');
const chalk = require('chalk');
const LoadCommand = require('../commands/load');
const { RunCommand, StepCommand } = require('../commands/run');
const ScreenshotCommand = require('../commands/screenshot');
const RecordCommand = require('../commands/record');
const InputCommand = require('../commands/input');
const SpritesCommand = require('../commands/sprites');
const AudioCommand = require('../commands/audio');
const { SaveStateCommand, LoadStateCommand } = require('../commands/state');
const DumpCommand = require('../commands/dump');

class REPLShell {
  constructor() {
    this.emulator = null;
    this.loadCommand = null;
    this.running = true;
  }

  async start() {
    console.log(chalk.cyan('╔════════════════════════════════════╗'));
    console.log(chalk.cyan('║        NES CLI Emulator            ║'));
    console.log(chalk.cyan('║   Type "help" for commands         ║'));
    console.log(chalk.cyan('╚════════════════════════════════════╝'));
    console.log();

    while (this.running) {
      const { command } = await inquirer.prompt([{
        type: 'input',
        name: 'command',
        message: chalk.magenta('nes-cli>'),
        prefix: ''
      }]);

      await this.execute(command.trim());
    }
  }

  async execute(input) {
    if (!input) return;

    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case 'help':
        case '?':
          this.showHelp();
          break;
        case 'exit':
        case 'quit':
        case 'q':
          this.running = false;
          console.log(chalk.yellow('Goodbye!'));
          break;
        case 'load':
          if (args.length < 1) {
            console.log(chalk.red('Usage: load <rom.nes>'));
            return;
          }
          this.loadCommand = new LoadCommand();
          this.loadCommand.execute(args[0]);
          this.emulator = this.loadCommand.getEmulator();
          break;
        case 'run':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new RunCommand(this.emulator).execute({ frames: args[0] || 60 });
          break;
        case 'step':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new StepCommand(this.emulator).execute({ frames: args[0] || 1 });
          break;
        case 'screenshot':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new ScreenshotCommand(this.emulator).execute({ 
            output: args[0],
            format: args[1] 
          });
          break;
        case 'record':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new RecordCommand(this.emulator).execute({
            format: args[0] || 'png-sequence',
            duration: args[1] || '5s',
            output: args[2]
          });
          break;
        case 'input':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new InputCommand(this.emulator).execute({ button: args[0] });
          break;
        case 'sprites':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new SpritesCommand(this.emulator).execute({
            format: args.find(a => ['chr', 'oam', 'metasprite', 'animation', 'all'].includes(a)) || 'all',
            outputDir: args.find(a => !['chr', 'oam', 'metasprite', 'animation', 'all'].includes(a)) || './sprites',
            frames: parseInt(args.find(a => a.startsWith('frames='))?.split('=')[1]) || 60
          });
          break;
        case 'audio':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new AudioCommand(this.emulator).execute({
            format: args[0] || 'wav',
            duration: args[1] || '10s',
            output: args[2]
          });
          break;
        case 'save':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new SaveStateCommand(this.emulator).execute({ 
            slot: args[0],
            output: args[1] 
          });
          break;
        case 'load-state':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          new LoadStateCommand(this.emulator).execute({ 
            slot: args[0],
            input: args[1] 
          });
          break;
        case 'dump':
          if (!this.emulator) { console.log(chalk.red('Load a ROM first')); return; }
          const dump = new DumpCommand(this.emulator);
          if (args.includes('cpu')) dump.execute({ cpuRegisters: true });
          if (args.includes('ppu')) dump.execute({ ppuRegisters: true });
          if (args.includes('oam')) dump.execute({ oam: true });
          if (args.includes('mem')) {
            const rangeIndex = args.indexOf('mem') + 1;
            dump.execute({ memory: true, range: args[rangeIndex] });
          }
          if (args.length === 0) dump.execute({});
          break;
        default:
          console.log(chalk.red(`Unknown command: ${cmd}. Type "help" for available commands.`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  }

  showHelp() {
    console.log(chalk.cyan('\nAvailable Commands:'));
    console.log('  load <rom.nes>              Load a ROM file');
    console.log('  run [frames]                Run N frames (default: 60)');
    console.log('  step [frames]               Step N frames (default: 1)');
    console.log('  screenshot [file] [format]  Capture screenshot (png, ascii, ansi)');
    console.log('  record [format] [duration]  Record screen (png-sequence, gif, ascii, ansi)');
    console.log('  input <button>             Press button (A, B, SELECT, START, UP, DOWN, LEFT, RIGHT)');
    console.log('  sprites [format] [dir]      Extract sprites (chr, oam, metasprite, animation, all)');
    console.log('  audio [format] [duration]   Record audio (wav, pcm, json)');
    console.log('  save [slot] [file]          Save state');
    console.log('  load-state [slot] [file]    Load state');
    console.log('  dump [cpu|ppu|oam|mem]      Dump debug info');
    console.log('  help                        Show this help');
    console.log('  exit                        Exit REPL\n');
  }
}

module.exports = REPLShell;
