#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const LoadCommand = require('../src/commands/load');
const { RunCommand, StepCommand } = require('../src/commands/run');
const ScreenshotCommand = require('../src/commands/screenshot');
const RecordCommand = require('../src/commands/record');
const InputCommand = require('../src/commands/input');
const SpritesCommand = require('../src/commands/sprites');
const AudioCommand = require('../src/commands/audio');
const { SaveStateCommand, LoadStateCommand } = require('../src/commands/state');
const DumpCommand = require('../src/commands/dump');
const REPLShell = require('../src/repl/shell');

const program = new Command();

program
  .name('nes-cli')
  .description('NES emulator CLI with headless mode, screen recording, sprite extraction, and audio capture')
  .version('1.0.0');

let currentEmulator = null;

function getEmulator() {
  if (!currentEmulator) {
    console.error(chalk.red('No ROM loaded. Use "load" command first.'));
    process.exit(1);
  }
  return currentEmulator;
}

// Load command
program
  .command('load <rom>')
  .description('Load a NES ROM file and optionally run frames')
  .option('-f, --frames <n>', 'Run N frames after loading')
  .option('-s, --screenshot <file>', 'Take screenshot after loading')
  .action((rom, options) => {
    if (!fs.existsSync(rom)) {
      console.error(chalk.red(`ROM not found: ${rom}`));
      process.exit(1);
    }
    const loadCmd = new LoadCommand();
    const frames = options.frames ? parseInt(options.frames) : undefined;
    loadCmd.execute(rom, { frames, screenshot: options.screenshot });
    currentEmulator = loadCmd.getEmulator();
  });

// Run command
program
  .command('run [frames]')
  .description('Run N frames (default: 60)')
  .action((frames) => {
    const cmd = new RunCommand(getEmulator());
    cmd.execute({ frames: frames || 60 });
  });

// Step command
program
  .command('step [frames]')
  .description('Step N frames (default: 1)')
  .action((frames) => {
    const cmd = new StepCommand(getEmulator());
    cmd.execute({ frames: frames || 1 });
  });

// Screenshot command
program
  .command('screenshot [output]')
  .description('Take a screenshot')
  .option('-f, --format <format>', 'Format: png, ascii, ansi', 'png')
  .option('-s, --scale <n>', 'Scale factor for ASCII/ANSI', '0.5')
  .action((output, options) => {
    const cmd = new ScreenshotCommand(getEmulator());
    cmd.execute({ output, format: options.format, scale: parseFloat(options.scale) });
  });

// Record command
program
  .command('record')
  .description('Record screen to file')
  .option('-f, --format <format>', 'Format: png-sequence, gif, ascii, ansi', 'gif')
  .option('-d, --duration <time>', 'Duration (e.g., 10s, 500ms)', '5s')
  .option('-o, --output <path>', 'Output file or directory')
  .option('--fps <n>', 'Frames per second', '60')
  .option('-s, --scale <n>', 'Scale factor for ASCII/ANSI', '0.5')
  .action((options) => {
    const cmd = new RecordCommand(getEmulator());
    cmd.execute({
      format: options.format,
      duration: options.duration,
      output: options.output,
      fps: parseInt(options.fps),
      scale: parseFloat(options.scale)
    });
  });

// Input command
program
  .command('input <button>')
  .description('Press controller button (A, B, SELECT, START, UP, DOWN, LEFT, RIGHT)')
  .option('-p, --player <n>', 'Player number', '1')
  .option('--hold', 'Hold button for duration')
  .option('--duration <ms>', 'Hold duration in ms', '500')
  .option('--sequence <seq>', 'Button sequence (comma-separated)')
  .option('--delay <ms>', 'Delay between sequence buttons', '100')
  .action((button, options) => {
    const cmd = new InputCommand(getEmulator());
    if (options.sequence) {
      cmd.execute({
        sequence: options.sequence,
        player: parseInt(options.player),
        delay: parseInt(options.delay)
      });
    } else {
      cmd.execute({
        button,
        player: parseInt(options.player),
        hold: options.hold,
        duration: parseInt(options.duration)
      });
    }
  });

// Sprites command
program
  .command('sprites')
  .description('Extract sprites from OAM and CHR ROM')
  .option('-f, --format <format>', 'Format: chr, oam, all', 'all')
  .option('-o, --output <path>', 'Output directory', './sprites')
  .option('-i, --individual', 'Also generate individual PNG files (1280 for CHR, ~64 for OAM)')
  .action((options) => {
    const cmd = new SpritesCommand(getEmulator());
    cmd.execute({
      format: options.format,
      outputDir: options.output,
      individual: options.individual
    });
  });

// Audio command
program
  .command('audio')
  .description('Record audio from emulator')
  .option('-f, --format <format>', 'Format: wav, pcm, json', 'wav')
  .option('-d, --duration <time>', 'Duration (e.g., 10s, 5s)', '10s')
  .option('-o, --output <file>', 'Output file path')
  .option('-r, --sample-rate <hz>', 'Sample rate', '44100')
  .action((options) => {
    const cmd = new AudioCommand(getEmulator());
    cmd.execute({
      format: options.format,
      duration: options.duration,
      output: options.output,
      sampleRate: parseInt(options.sampleRate)
    });
  });

// Save state command
program
  .command('save [file]')
  .description('Save emulator state to file')
  .option('-s, --slot <n>', 'Quick save slot number')
  .action((file, options) => {
    const cmd = new SaveStateCommand(getEmulator());
    cmd.execute({ slot: options.slot, output: file || 'state.json' });
  });

// Load state command
program
  .command('load-state [file]')
  .description('Load emulator state from file')
  .option('-s, --slot <n>', 'Quick load slot number')
  .action((file, options) => {
    const cmd = new LoadStateCommand(getEmulator());
    cmd.execute({ slot: options.slot, input: file || 'state.json' });
  });

// Dump command
program
  .command('dump [type]')
  .description('Dump debug info (cpu, ppu, oam, mem)')
  .option('-r, --range <range>', 'Memory range (e.g., 0x0000-0x00FF)')
  .action((type, options) => {
    const cmd = new DumpCommand(getEmulator());
    const dumpOptions = {};
    if (type === 'cpu' || !type) dumpOptions.cpuRegisters = true;
    if (type === 'ppu' || !type) dumpOptions.ppuRegisters = true;
    if (type === 'oam') dumpOptions.oam = true;
    if (type === 'mem') {
      dumpOptions.memory = true;
      dumpOptions.range = options.range;
    }
    cmd.execute(dumpOptions);
  });

// REPL command
program
  .command('repl')
  .description('Start interactive REPL mode')
  .action(async () => {
    const shell = new REPLShell();
    await shell.start();
  });

// Batch command
program
  .command('batch <file>')
  .description('Execute commands from script file')
  .action(async (file) => {
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }
    const commands = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const shell = new REPLShell();
    for (const cmd of commands) {
      console.log(chalk.gray(`> ${cmd}`));
      await shell.execute(cmd.trim());
    }
  });

// Script command - run a complete script in one go
program
  .command('script <rom> [commands...]')
  .description('Load ROM and execute commands: run:N, screenshot:file, sprites:dir, audio:N')
  .action(async (rom, commands) => {
    if (!fs.existsSync(rom)) {
      console.error(chalk.red(`ROM not found: ${rom}`));
      process.exit(1);
    }
    
    const loadCmd = new LoadCommand();
    loadCmd.execute(rom);
    currentEmulator = loadCmd.getEmulator();
    
    for (const cmd of commands) {
      const [action, ...args] = cmd.split(':');
      console.log(chalk.gray(`> ${action} ${args.join(' ')}`));
      
      switch (action) {
        case 'run':
          new RunCommand(currentEmulator).execute({ frames: parseInt(args[0]) || 60 });
          break;
        case 'step':
          new StepCommand(currentEmulator).execute({ frames: parseInt(args[0]) || 1 });
          break;
        case 'screenshot':
          const outputFile = args[0] || 'screenshot.png';
          const ext = require('path').extname(outputFile).toLowerCase();
          const format = ext === '.txt' ? 'ascii' : ext === '.ansi' ? 'ansi' : 'png';
          new ScreenshotCommand(currentEmulator).execute({ output: outputFile, format });
          break;
        case 'record':
          new RecordCommand(currentEmulator).execute({ format: args[0] || 'gif', duration: args[1] || '5s', output: args[2] });
          break;
        case 'input':
          new InputCommand(currentEmulator).execute({ button: args[0] });
          break;
        case 'sprites':
          const spritesArgs = args.join(':').split(' ').filter(a => a);
          const spritesDir = spritesArgs[0] || './sprites';
          const spritesIndividual = spritesArgs.includes('--individual') || spritesArgs.includes('-i');
          new SpritesCommand(currentEmulator).execute({ 
            outputDir: spritesDir,
            individual: spritesIndividual
          });
          break;
        case 'audio':
          new AudioCommand(currentEmulator).execute({ duration: args[0] || '10s', output: args[1] });
          break;
        case 'dump':
          new DumpCommand(currentEmulator).execute({});
          break;
        default:
          console.error(chalk.red(`Unknown action: ${action}`));
      }
    }
  });

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}