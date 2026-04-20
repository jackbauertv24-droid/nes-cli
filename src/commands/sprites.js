const SpriteHandler = require('../formats/image/spritesheet');
const PNGHandler = require('../formats/image/png');
const FileUtils = require('../utils/file');
const chalk = require('chalk');
const fs = require('fs');

class SpritesCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const format = options.format || 'png';
    const outputDir = options.outputDir || './sprites';
    const output = options.output || null;

    console.log(chalk.blue('Extracting sprites...'));

    switch (format) {
      case 'oam':
        return this.extractOAM(output || `${outputDir}/oam.json`);
      case 'chr':
        return this.extractCHR(outputDir, options);
      case 'png':
      case 'json':
      case 'all':
        return this.extractAllSprites(outputDir, format);
      default:
        console.error(chalk.red(`Unknown format: ${format}`));
        return false;
    }
  }

  extractOAM(outputPath) {
    const sprites = SpriteHandler.extractOAM(this.emulator);
    const dir = require('path').dirname(outputPath);
    FileUtils.ensureDir(dir);
    
    const { JSONHandler } = require('../formats/data/json-csv');
    JSONHandler.save(sprites, outputPath);
    
    console.log(chalk.green(`OAM sprites saved: ${outputPath}`));
    console.log(chalk.gray(`  Found ${sprites.length} sprites`));
    return outputPath;
  }

  extractCHR(outputDir, options = {}) {
    FileUtils.ensureDir(outputDir);
    
    if (!this.emulator.currentROM) {
      console.error(chalk.red('No ROM loaded'));
      return false;
    }

    const romData = fs.readFileSync(this.emulator.currentROM);
    const bank = parseInt(options.bank) || 0;
    const tiles = SpriteHandler.extractCHRTiles(romData, bank);

    if (options.spritesheet) {
      const outputPath = options.output || `${outputDir}/chr_bank${bank}.png`;
      SpriteHandler.createSpriteSheet(tiles, outputPath);
      console.log(chalk.green(`CHR spritesheet saved: ${outputPath}`));
      return outputPath;
    }

    const results = SpriteHandler.saveSprites(tiles, outputDir, 'png');
    console.log(chalk.green(`CHR tiles saved to: ${outputDir}`));
    console.log(chalk.gray(`  Extracted ${tiles.length} tiles`));
    return results;
  }

  extractAllSprites(outputDir, format) {
    FileUtils.ensureDir(outputDir);
    const results = [];

    // Extract OAM
    const oamSprites = SpriteHandler.extractOAM(this.emulator);
    const { JSONHandler } = require('../formats/data/json-csv');
    const oamPath = `${outputDir}/oam.json`;
    JSONHandler.save(oamSprites, oamPath);
    results.push(oamPath);
    console.log(chalk.gray(`  OAM: ${oamSprites.length} sprites`));

    // Extract CHR
    if (this.emulator.currentROM) {
      const romData = fs.readFileSync(this.emulator.currentROM);
      const tiles = SpriteHandler.extractCHRTiles(romData, 0);
      
      if (format === 'png' || format === 'all') {
        const chrResults = SpriteHandler.saveSprites(tiles, `${outputDir}/chr`, 'png');
        results.push(...chrResults);
      }
      
      const spritesheetPath = `${outputDir}/chr_spritesheet.png`;
      SpriteHandler.createSpriteSheet(tiles, spritesheetPath);
      results.push(spritesheetPath);
      console.log(chalk.gray(`  CHR: ${tiles.length} tiles`));
    }

    console.log(chalk.green(`Sprites extracted to: ${outputDir}`));
    return results;
  }
}

module.exports = SpritesCommand;
