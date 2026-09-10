#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const Emulator = require('../src/core/emulator');
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
const DEFAULT_SESSION = '.nes-cli-session.json';

program
  .name('nes-cli')
  .description('Headless NES emulator for the command line')
  .version(require('../package.json').version)
  .option('--session <file>', 'Session file used to carry emulator state between commands', DEFAULT_SESSION);

/**
 * Each invocation is a fresh process, so emulator state has to live on disk
 * between commands. `load` writes the session; every other command reads it,
 * does its work, and writes it back. Without this, `nes-cli load` followed by
 * `nes-cli run` could never work - the second process had no emulator.
 *
 * Use `script` or `repl` to avoid the save/restore cost entirely.
 */
function sessionFile() {
  return program.opts().session || DEFAULT_SESSION;
}

function openSession() {
  const file = sessionFile();

  if (!fs.existsSync(file)) {
    console.error(chalk.red(`No session found at ${file}.`));
    console.error(chalk.gray('Run "nes-cli load <rom.nes>" first, or use "nes-cli script <rom.nes> ...".'));
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (!fs.existsSync(data.rom)) {
    console.error(chalk.red(`Session references a ROM that no longer exists: ${data.rom}`));
    process.exit(1);
  }

  const emulator = new Emulator();
  emulator.loadROM(data.rom);
  emulator.setState(data);

  // jsnes serialises memory but not the rendered screen, so carry it in the
  // session too. Without this a screenshot immediately after a restore shows
  // the power-on frame instead of the game.
  if (data.frameBuffer) {
    emulator.setFrameBuffer(new Int32Array(Buffer.from(data.frameBuffer, 'base64').buffer));
  }

  return emulator;
}

function saveSession(emulator) {
  const state = emulator.getState();
  const frame = emulator.getFrameBuffer();

  if (frame) {
    state.frameBuffer = Buffer.from(Int32Array.from(frame).buffer).toString('base64');
  }

  fs.writeFileSync(sessionFile(), JSON.stringify(state));
}

/**
 * Run a command against the stored session and persist whatever it changed.
 *
 * A command that returns false has already explained itself on stderr; exiting
 * non-zero lets shell scripts and CI notice, which matters for a tool whose
 * whole point is being driven by other programs.
 */
function withSession(fn) {
  const emulator = openSession();
  const result = fn(emulator);
  saveSession(emulator);

  if (result === false) {
    process.exit(1);
  }

  return result;
}

program
  .command('load <rom>')
  .description('Load a ROM and start a session')
  .option('-f, --frames <n>', 'Run N frames after loading')
  .option('-s, --screenshot <file>', 'Take a screenshot after loading')
  .action((rom, options) => {
    const loadCmd = new LoadCommand();
    if (!loadCmd.execute(rom, { frames: options.frames, screenshot: options.screenshot })) {
      process.exit(1);
    }
    saveSession(loadCmd.getEmulator());
    console.log(chalk.gray(`Session: ${sessionFile()}`));
  });

program
  .command('run [frames]')
  .description('Run N frames (default: 60)')
  .action((frames) => {
    withSession((emulator) => new RunCommand(emulator).execute({ frames: frames || 60 }));
  });

program
  .command('step [frames]')
  .description('Step N frames (default: 1)')
  .action((frames) => {
    withSession((emulator) => new StepCommand(emulator).execute({ frames: frames || 1 }));
  });

program
  .command('screenshot [output]')
  .description('Capture the current frame')
  .option('-f, --format <format>', 'png, ascii, or ansi', 'png')
  .option('-s, --scale <n>', 'Scale factor for ascii/ansi', '0.5')
  .action((output, options) => {
    withSession((emulator) =>
      new ScreenshotCommand(emulator).execute({
        output,
        format: options.format,
        scale: parseFloat(options.scale)
      })
    );
  });

program
  .command('record')
  .description('Record the screen')
  .option('-f, --format <format>', 'gif, png-sequence, ascii, or ansi', 'gif')
  .option('-d, --duration <time>', 'Emulated time to capture (10s, 1.5s, 500ms, 2m, 900f)', '5s')
  .option('-o, --output <path>', 'Output file or directory')
  .option('--fps <n>', 'Playback rate; frames are sampled down to it', '30')
  .option('-s, --scale <n>', 'Scale factor for ascii/ansi', '0.5')
  .action((options) => {
    withSession((emulator) =>
      new RecordCommand(emulator).execute({
        format: options.format,
        duration: options.duration,
        output: options.output,
        fps: options.fps,
        scale: parseFloat(options.scale)
      })
    );
  });

program
  .command('input <button>')
  .description('Press a button (A, B, SELECT, START, UP, DOWN, LEFT, RIGHT)')
  .option('-p, --player <n>', 'Player number', '1')
  .option('--hold-frames <n>', 'Frames to hold the button (default: 3)')
  .option('--duration <ms>', 'Hold time in milliseconds, converted to frames')
  .option('--sequence <seq>', 'Comma-separated buttons to press in turn')
  .option('--delay <ms>', 'Gap between buttons in a sequence')
  .action((button, options) => {
    withSession((emulator) =>
      new InputCommand(emulator).execute({
        button,
        sequence: options.sequence,
        player: options.player,
        holdFrames: options.holdFrames,
        duration: options.duration,
        delay: options.delay
      })
    );
  });

program
  .command('sprites')
  .description('Extract sprites from OAM and the live pattern tables')
  .option('-f, --format <format>', 'chr, oam, metasprite, animation, or all', 'all')
  .option('-o, --output <path>', 'Output directory', './sprites')
  .option('-i, --individual', 'Also write one PNG per tile/sprite')
  .option('--frames <n>', 'Frames to analyse for metasprites', '60')
  .option('--at-row <n>', 'For chr: read the banks active on this screen row')
  .option('--max-gap <n>', 'Pixel gap that still counts as one metasprite', '8')
  .option('--min-sprites <n>', 'Minimum sprites per metasprite', '2')
  .option('--min-y <n>', 'Ignore sprites above this screen row')
  .option('--max-y <n>', 'Ignore sprites below this screen row')
  .option('--palettes <list>', 'Comma-separated sprite palettes to consider (0-3)')
  .option('--max-size <n>', 'Reject clusters larger than this many pixels square', '64')
  .option('--max-sprites <n>', 'Reject clusters of more than this many sprites', '16')
  .option('--by-palette', 'Also write one sheet per sprite palette, usually one per character')
  .option('--sheet-columns <n>', 'Poses per row in a sheet or strip (default 8 for sheets, 16 for strips)')
  .option('--min-hold <n>', 'For animation: ignore poses held fewer frames than this', '2')
  .option('--min-poses <n>', 'For animation: a clip needs at least this many distinct poses', '2')
  .option('--max-move <n>', 'For animation: pixels a character may move between frames', '24')
  .option('--max-clips <n>', 'For animation: how many characters to write', '10')
  .action((options) => {
    withSession((emulator) =>
      new SpritesCommand(emulator).execute({
        format: options.format,
        outputDir: options.output,
        individual: options.individual,
        frames: parseInt(options.frames, 10),
        atRow: options.atRow == null ? undefined : parseInt(options.atRow, 10),
        maxGap: parseInt(options.maxGap, 10),
        minSprites: parseInt(options.minSprites, 10),
        minY: options.minY == null ? undefined : parseInt(options.minY, 10),
        maxY: options.maxY == null ? undefined : parseInt(options.maxY, 10),
        palettes: options.palettes
          ? options.palettes.split(',').map((p) => parseInt(p, 10))
          : undefined,
        maxWidth: parseInt(options.maxSize, 10),
        maxHeight: parseInt(options.maxSize, 10),
        maxSprites: parseInt(options.maxSprites, 10),
        byPalette: options.byPalette,
        sheetColumns: options.sheetColumns == null ? undefined : parseInt(options.sheetColumns, 10),
        minHold: parseInt(options.minHold, 10),
        minPoses: parseInt(options.minPoses, 10),
        maxMove: parseInt(options.maxMove, 10),
        maxClips: parseInt(options.maxClips, 10)
      })
    );
  });

program
  .command('audio')
  .description('Record audio')
  .option('-f, --format <format>', 'wav, pcm, or json', 'wav')
  .option('-d, --duration <time>', 'Emulated time to capture', '10s')
  .option('-o, --output <file>', 'Output file')
  .action((options) => {
    withSession((emulator) =>
      new AudioCommand(emulator).execute({
        format: options.format,
        duration: options.duration,
        output: options.output
      })
    );
  });

program
  .command('save-state [file]')
  .alias('save')
  .description('Write the session state to a named file')
  .action((file) => {
    withSession((emulator) => new SaveStateCommand(emulator).execute({ output: file || 'state.json' }));
  });

program
  .command('load-state [file]')
  .description('Restore the session from a named state file')
  .action((file) => {
    withSession((emulator) => new LoadStateCommand(emulator).execute({ input: file || 'state.json' }));
  });

program
  .command('dump [type]')
  .description('Dump debug info (cpu, ppu, oam, mem)')
  .option('-r, --range <range>', 'Memory range, e.g. 0x0000-0x00FF')
  .action((type, options) => {
    withSession((emulator) => {
      const dumpOptions = {};
      if (type === 'cpu' || !type) dumpOptions.cpuRegisters = true;
      if (type === 'ppu' || !type) dumpOptions.ppuRegisters = true;
      if (type === 'oam') dumpOptions.oam = true;
      if (type === 'mem') {
        dumpOptions.memory = true;
        dumpOptions.range = options.range;
      }
      return new DumpCommand(emulator).execute(dumpOptions);
    });
  });

program
  .command('repl')
  .description('Interactive shell (keeps one emulator in memory)')
  .action(async () => {
    await new REPLShell().start();
  });

program
  .command('script <rom> [commands...]')
  .description('Load a ROM and run several commands in one process, e.g. run:300 screenshot:out.png')
  .action((rom, commands) => {
    const loadCmd = new LoadCommand();
    if (!loadCmd.execute(rom)) {
      process.exit(1);
    }

    const shell = new REPLShell();
    shell.adopt(loadCmd.getEmulator());

    for (const entry of commands) {
      const [action, ...args] = entry.split(':');
      console.log(chalk.gray(`> ${action} ${args.join(' ')}`));
      shell.executeSync(action, args);
    }
  });

program
  .command('batch <file>')
  .description('Run REPL commands from a file')
  .action(async (file) => {
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`File not found: ${file}`));
      process.exit(1);
    }

    const shell = new REPLShell();
    const lines = fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    for (const line of lines) {
      console.log(chalk.gray(`> ${line}`));
      await shell.execute(line);
    }
  });

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}
