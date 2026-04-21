const SpriteHandler = require('../formats/image/spritesheet');
const MetaspriteAnalyzer = require('../formats/image/metasprite');
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
    const frames = options.frames || 60;
    const maxGap = options.maxGap || 16;
    const minSprites = options.minSprites || 2;

    console.log(chalk.blue('Extracting sprites...'));

    switch (format) {
      case 'chr':
        return this.extractCHR(`${outputDir}/chr`, individual);
      case 'oam':
        return this.extractOAM(outputDir, individual);
      case 'metasprite':
        return this.extractMetasprites(outputDir, frames, maxGap, minSprites);
      case 'animation':
        return this.extractAnimations(outputDir, frames * 2, maxGap, minSprites);
      case 'all':
      default:
        this.extractCHR(`${outputDir}/chr`, individual);
        this.extractOAM(`${outputDir}/oam`, individual);
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
    
    SpriteHandler.saveOAMSprites(oamSprites, outputDir, individual);
    
    console.log(chalk.green(`OAM sprites: ${outputDir}`));
    console.log(chalk.gray(`  ${visibleSprites.length} visible sprites`));
    console.log(chalk.gray(`  Metadata: oam.json`));
    if (individual) {
      console.log(chalk.gray(`  Individual files: ${visibleSprites.length} PNGs`));
    }
    
    return outputDir;
  }

  extractMetasprites(outputDir, frames = 60, maxGap = 16, minSprites = 2) {
    FileUtils.ensureDir(outputDir);
    
    console.log(chalk.blue(`Running ${frames} frames to analyze metasprites...`));
    
    const analyzer = new MetaspriteAnalyzer(this.emulator);
    const metasprites = analyzer.analyzeMetasprites(frames, maxGap, minSprites);
    
    if (metasprites.length === 0) {
      console.log(chalk.yellow('No metasprites found. Try running more frames or adjusting parameters.'));
      return null;
    }
    
    const bestMetasprites = analyzer.extractBestMetasprites(metasprites, 20);
    
    if (bestMetasprites.length === 0) {
      console.log(chalk.yellow('No valid metasprites to extract.'));
      return null;
    }
    
    analyzer.saveMetasprites(bestMetasprites, outputDir);
    
    console.log(chalk.green(`Metasprites: ${outputDir}`));
    console.log(chalk.gray(`  ${bestMetasprites.length} metasprites extracted`));
    console.log(chalk.gray(`  Metadata: metasprites.json`));
    
    return outputDir;
  }

  extractAnimations(outputDir, frames = 120, maxGap = 16, minSprites = 2) {
    FileUtils.ensureDir(outputDir);
    
    console.log(chalk.blue(`Running ${frames} frames to track animations...`));
    
    const analyzer = new MetaspriteAnalyzer(this.emulator);
    const animations = analyzer.trackAnimations(frames, maxGap, minSprites);
    
    if (animations.length === 0) {
      console.log(chalk.yellow('No animations found. Try running more frames or adjusting parameters.'));
      return null;
    }
    
    const extractedAnimations = analyzer.extractAnimations(animations, 10);
    
    if (extractedAnimations.length === 0) {
      console.log(chalk.yellow('No valid animations to extract.'));
      return null;
    }
    
    analyzer.saveAnimations(extractedAnimations, outputDir);
    
    console.log(chalk.green(`Animations: ${outputDir}`));
    console.log(chalk.gray(`  ${extractedAnimations.length} animations extracted`));
    console.log(chalk.gray(`  Each animation has spritesheet + frame PNGs`));
    console.log(chalk.gray(`  Metadata: animations.json`));
    
    return outputDir;
  }
}

module.exports = SpritesCommand;