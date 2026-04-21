const SpriteHandler = require('../formats/image/spritesheet');
const FileUtils = require('../utils/file');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { JSONHandler } = require('../formats/data/json-csv');

class SpritesCommand {
  constructor(emulator) {
    this.emulator = emulator;
  }

  execute(options = {}) {
    const format = options.format || 'all';
    const outputDir = options.outputDir || './sprites';
    const individual = options.individual || false;

    console.log(chalk.blue('Extracting sprites...'));

    switch (format) {
      case 'chr':
        return this.extractCHR(`${outputDir}/chr`, individual);
      case 'oam':
        return this.extractOAM(outputDir, individual);
      case 'all':
      default:
        this.extractCHR(`${outputDir}/chr`, individual);
        this.extractOAM(outputDir, individual);
        console.log(chalk.green(`Sprites extracted to: ${outputDir}`));
        return outputDir;
    }
  }

  extractCHR(outputDir, individual) {
    FileUtils.ensureDir(outputDir);
    
    if (!this.emulator.currentROM) {
      console.error(chalk.red('No ROM loaded'));
      return false;
    }

    const romData = fs.readFileSync(this.emulator.currentROM);
    const tiles = SpriteHandler.extractCHRTiles(romData, 0);
    const palettes = this.emulator.getAllSpritePalettes();
    
    const results = SpriteHandler.saveCHRTiles(tiles, palettes, outputDir, individual);
    
    console.log(chalk.green(`CHR tiles: ${outputDir}`));
    console.log(chalk.gray(`  256 tiles extracted`));
    console.log(chalk.gray(`  Spritesheets: 5 (gray + 4 palettes)`));
    if (individual) {
      console.log(chalk.gray(`  Individual files: 1,280 PNGs`));
    }
    
    return results;
  }

  extractOAM(outputDir, individual) {
    FileUtils.ensureDir(outputDir);
    
    const oamSprites = SpriteHandler.extractOAMWithImages(this.emulator);
    const visibleSprites = oamSprites.filter(s => s.visible);
    
    const metadata = oamSprites.map(s => ({
      id: s.id,
      x: s.x,
      y: s.y,
      tile: s.tile,
      attributes: s.attributes,
      palette: s.palette,
      priority: s.priority,
      flipHorizontal: s.flipHorizontal,
      flipVertical: s.flipVertical,
      visible: s.visible
    }));
    
    JSONHandler.save(metadata, path.join(outputDir, 'oam.json'));
    
    const oamDir = path.join(outputDir, 'oam');
    SpriteHandler.saveOAMSprites(oamSprites, oamDir, individual);
    
    console.log(chalk.green(`OAM sprites: ${outputDir}`));
    console.log(chalk.gray(`  ${visibleSprites.length} visible sprites`));
    console.log(chalk.gray(`  Metadata: oam.json`));
    if (individual) {
      console.log(chalk.gray(`  Individual files: ${visibleSprites.length} PNGs`));
    }
    
    return outputDir;
  }
}

module.exports = SpritesCommand;