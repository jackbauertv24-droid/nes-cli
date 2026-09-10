const SpriteHandler = require('../formats/image/spritesheet');
const MetaspriteAnalyzer = require('../formats/image/metasprite');
const AnimationTracker = require('../formats/image/animation');
const FileUtils = require('../utils/file');
const { JSONHandler } = require('../formats/data/json-csv');
const chalk = require('chalk');
const path = require('path');

class SpritesCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const format = options.format || 'all';
    const outputDir = options.outputDir || './sprites';

    switch (format) {
      case 'chr':
        return this.extractPatternTables(path.join(outputDir, 'chr'), options.individual, options.atRow);
      case 'oam':
        return this.extractOAM(path.join(outputDir, 'oam'), options.individual);
      case 'metasprite':
        return this.extractMetasprites(path.join(outputDir, 'metasprites'), options);
      case 'animation':
        return this.extractAnimations(path.join(outputDir, 'animations'), options);
      case 'all':
      default:
        this.extractPatternTables(path.join(outputDir, 'chr'), options.individual, options.atRow);
        this.extractOAM(path.join(outputDir, 'oam'), options.individual);
        return outputDir;
    }
  }

  /**
   * Dump both pattern tables.
   *
   * The output is a snapshot, not the whole cartridge: a mapper that swaps CHR
   * banks shows different tiles at a different moment. Run some frames to reach
   * the scene you care about first.
   *
   * Games that re-bank partway down the frame - SMB3 gives its status bar its
   * own tiles - need atRow to say which part of the screen you mean. Without
   * it this reads the banks left in place at the end of the frame, which for
   * those games is the bottom strip.
   */
  extractPatternTables(outputDir, individual, atRow) {
    FileUtils.ensureDir(outputDir);
    const results = SpriteHandler.savePatternTables(
      this.emulator,
      outputDir,
      individual,
      atRow
    );

    console.log(chalk.green(`Pattern tables: ${outputDir}`));
    console.log(chalk.gray(`  512 tiles (2 tables x 256), ${results.length} sheets`));
    console.log(
      chalk.gray(
        `  Frame ${this.emulator.frameCount}` +
          (atRow == null ? ' (end of frame)' : `, as banked on screen row ${atRow}`)
      )
    );
    return results;
  }

  extractOAM(outputDir, individual) {
    FileUtils.ensureDir(outputDir);

    const sprites = SpriteHandler.extractOAMWithImages(this.emulator);
    const visible = sprites.filter((s) => s.visible);

    JSONHandler.save(
      sprites.map(({ renderedPixels, paletteColors, ...meta }) => meta),
      path.join(outputDir, 'oam.json')
    );
    SpriteHandler.saveOAMSprites(sprites, outputDir, individual);

    console.log(chalk.green(`OAM sprites: ${outputDir}`));
    console.log(
      chalk.gray(
        `  ${visible.length} visible of 64, ` +
          `${this.emulator.is8x16Sprites() ? '8x16' : '8x8'} mode`
      )
    );
    return outputDir;
  }

  /**
   * Follow characters across frames and write each one's poses in order.
   *
   * Where metasprite extraction answers "which poses appear in this stretch",
   * this answers "in what order does one character move through them, and for
   * how long".
   */
  extractAnimations(outputDir, options = {}) {
    FileUtils.ensureDir(outputDir);

    const frames = options.frames || 120;
    const tracker = new AnimationTracker(this.emulator, options);

    console.log(chalk.blue(`Tracking characters over ${frames} frames...`));

    const clips = tracker.track(
      frames,
      options.maxGap == null ? 8 : options.maxGap,
      options.minSprites == null ? 2 : options.minSprites
    );

    if (clips.length === 0) {
      console.log(
        chalk.yellow(
          'No animated characters found. Try more frames, or check that a character ' +
            'is on screen and moving (nes-cli dump oam).'
        )
      );
      return null;
    }

    const index = AnimationTracker.saveAnimations(
      clips,
      outputDir,
      options.sheetColumns || 16
    );

    console.log(chalk.green(`Animations: ${outputDir}`));
    for (const clip of index) {
      console.log(
        chalk.gray(
          `  ${clip.directory}: ${clip.cells} cells, ${clip.poseCount} poses, ` +
            `${clip.totalFrames} frames, palette ${clip.palette}`
        )
      );
    }

    return outputDir;
  }

  extractMetasprites(outputDir, options = {}) {
    FileUtils.ensureDir(outputDir);

    const frames = options.frames || 60;
    const analyzer = new MetaspriteAnalyzer(this.emulator, {
      minY: options.minY,
      maxY: options.maxY,
      palettes: options.palettes,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      maxSprites: options.maxSprites
    });

    console.log(chalk.blue(`Analysing ${frames} frames for metasprites...`));

    const found = analyzer.analyzeMetasprites(
      frames,
      options.maxGap == null ? 8 : options.maxGap,
      options.minSprites == null ? 2 : options.minSprites
    );

    if (found.length === 0) {
      console.log(
        chalk.yellow(
          'No recurring metasprites found. Try more frames, a larger --max-gap, ' +
            'or check that sprites are on screen (nes-cli dump oam).'
        )
      );
      return null;
    }

    const best = analyzer.extractBestMetasprites(found, options.maxCount || 20);
    analyzer.saveMetasprites(best, outputDir);

    console.log(chalk.green(`Metasprites: ${outputDir}`));
    console.log(chalk.gray(`  ${best.length} of ${found.length} candidates written`));

    this.writeSheets(best, outputDir, options);
    return outputDir;
  }

  /**
   * Write the tiled sheets that go alongside the individual pose PNGs.
   *
   * By default one sheet holds every pose found. With byPalette, each sprite
   * palette gets its own sheet, which in practice means one per character:
   * games almost always give each character its own palette, so this is what
   * separates Mario's poses from Luigi's.
   */
  writeSheets(metasprites, outputDir, options = {}) {
    const columns = options.sheetColumns || 8;
    const overall = MetaspriteAnalyzer.saveSheet(
      metasprites,
      path.join(outputDir, 'sheet.png'),
      columns
    );

    if (overall) {
      console.log(
        chalk.gray(`  sheet.png: ${overall.columns}x${overall.rows} cells of ${overall.cellWidth}x${overall.cellHeight}`)
      );
    }

    if (!options.byPalette) {
      return;
    }

    const palettes = [...new Set(metasprites.map((m) => m.palette))].sort();
    for (const palette of palettes) {
      const group = metasprites.filter((m) => m.palette === palette);
      const sheet = MetaspriteAnalyzer.saveSheet(
        group,
        path.join(outputDir, `sheet-palette${palette}.png`),
        columns
      );
      if (sheet) {
        console.log(chalk.gray(`  sheet-palette${palette}.png: ${group.length} poses`));
      }
    }
  }
}

module.exports = SpritesCommand;
