const SpriteHandler = require('../formats/image/spritesheet');
const MetaspriteAnalyzer = require('../formats/image/metasprite');
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
        return this.extractPatternTables(path.join(outputDir, 'chr'), options.individual);
      case 'oam':
        return this.extractOAM(path.join(outputDir, 'oam'), options.individual);
      case 'metasprite':
        return this.extractMetasprites(path.join(outputDir, 'metasprites'), options);
      case 'animation':
        console.error(
          chalk.red('Animation extraction is not implemented yet. Use --format metasprite.')
        );
        return false;
      case 'all':
      default:
        this.extractPatternTables(path.join(outputDir, 'chr'), options.individual);
        this.extractOAM(path.join(outputDir, 'oam'), options.individual);
        return outputDir;
    }
  }

  /**
   * Dump both pattern tables as they are banked *right now*.
   *
   * The output is a snapshot, not the whole cartridge: a mapper that swaps CHR
   * banks will show different tiles at a different moment. Run some frames to
   * reach the scene you care about before extracting.
   */
  extractPatternTables(outputDir, individual) {
    FileUtils.ensureDir(outputDir);
    const results = SpriteHandler.savePatternTables(this.emulator, outputDir, individual);

    console.log(chalk.green(`Pattern tables: ${outputDir}`));
    console.log(chalk.gray(`  512 tiles (2 tables x 256), ${results.length} sheets`));
    console.log(chalk.gray(`  Snapshot of frame ${this.emulator.frameCount}`));
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

  extractMetasprites(outputDir, options = {}) {
    FileUtils.ensureDir(outputDir);

    const frames = options.frames || 60;
    const analyzer = new MetaspriteAnalyzer(this.emulator, {
      minY: options.minY,
      maxY: options.maxY,
      palettes: options.palettes
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
    return outputDir;
  }
}

module.exports = SpritesCommand;
