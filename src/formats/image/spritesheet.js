const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const PNGHandler = require('./png');
const { JSONHandler } = require('../data/json-csv');

class SpriteHandler {
  static extractOAM(emulator) {
    const oam = emulator.getOAM();
    const sprites = [];
    
    for (let i = 0; i < 64; i++) {
      const offset = i * 4;
      const y = oam[offset];
      sprites.push({
        id: i,
        y: y,
        tile: oam[offset + 1],
        attributes: oam[offset + 2],
        x: oam[offset + 3],
        palette: (oam[offset + 2] & 0x03),
        priority: (oam[offset + 2] & 0x20) >> 5,
        flipHorizontal: (oam[offset + 2] & 0x40) >> 6,
        flipVertical: (oam[offset + 2] & 0x80) >> 7,
        visible: y < 240
      });
    }
    
    return sprites;
  }

  static extractOAMWithImages(emulator) {
    const sprites = this.extractOAM(emulator);
    const is8x16 = emulator.is8x16Sprites();
    
    return sprites.map(sprite => {
      if (!sprite.visible) {
        return { ...sprite, renderedPixels: null, width: 8, height: is8x16 ? 16 : 8 };
      }
      
      const palette = emulator.getSpritePalette(sprite.palette);
      let pixelData = this.getSpritePixels(emulator, sprite.tile, is8x16);
      
      if (sprite.flipHorizontal) {
        pixelData = this.flipHorizontal(pixelData, 8, is8x16 ? 16 : 8);
      }
      if (sprite.flipVertical) {
        pixelData = this.flipVertical(pixelData, 8, is8x16 ? 16 : 8);
      }
      
      return {
        ...sprite,
        renderedPixels: pixelData,
        palette,
        width: 8,
        height: is8x16 ? 16 : 8
      };
    });
  }

  static getSpritePixels(emulator, tileIndex, is8x16) {
    if (is8x16) {
      const tile1 = emulator.getTilePixelData(tileIndex & 0xFE);
      const tile2 = emulator.getTilePixelData((tileIndex & 0xFE) + 1);
      return [...tile1, ...tile2];
    }
    return emulator.getTilePixelData(tileIndex);
  }

  static flipHorizontal(pixelData, width, height) {
    const flipped = new Array(pixelData.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        flipped[y * width + (width - 1 - x)] = pixelData[y * width + x];
      }
    }
    return flipped;
  }

  static flipVertical(pixelData, width, height) {
    const flipped = new Array(pixelData.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        flipped[(height - 1 - y) * width + x] = pixelData[y * width + x];
      }
    }
    return flipped;
  }

  static extractCHRTiles(romData, bank = 0) {
    const tiles = [];
    const chrOffset = 16 + (bank * 0x2000);
    const hasCHR = romData.length > chrOffset + 0x2000;
    
    for (let tile = 0; tile < 256; tile++) {
      const tileOffset = chrOffset + (tile * 16);
      const pixelData = new Array(64).fill(0);
      
      if (hasCHR) {
        for (let y = 0; y < 8; y++) {
          const lowByte = romData[tileOffset + y] || 0;
          const highByte = romData[tileOffset + y + 8] || 0;
          
          for (let x = 0; x < 8; x++) {
            const bit = 7 - x;
            const lowBit = (lowByte >> bit) & 1;
            const highBit = (highByte >> bit) & 1;
            pixelData[y * 8 + x] = (highBit << 1) | lowBit;
          }
        }
      }
      
      tiles.push({
        id: tile,
        data: pixelData
      });
    }
    
    return tiles;
  }

  static getGrayscalePalette() {
    return [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]];
  }

  static createSpriteSheet(tiles, palette, outputPath, tilesPerRow = 8) {
    const tileSize = 8;
    const totalTiles = tiles.length;
    const rows = Math.ceil(totalTiles / tilesPerRow);
    const width = tilesPerRow * tileSize;
    const height = rows * tileSize;
    
    const png = new PNG({ width, height });
    
    for (let i = 0; i < totalTiles; i++) {
      const tile = tiles[i];
      const row = Math.floor(i / tilesPerRow);
      const col = i % tilesPerRow;
      
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const pixel = tile.data[y * tileSize + x];
          const [r, g, b] = palette[pixel] || [0, 0, 0];
          
          const destX = col * tileSize + x;
          const destY = row * tileSize + y;
          const idx = (destY * width + destX) * 4;
          
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = pixel === 0 ? 0 : 255;
        }
      }
    }
    
    fs.writeFileSync(outputPath, PNG.sync.write(png));
    return outputPath;
  }

  static createOAMSpriteSheet(sprites, outputPath, tilesPerRow = 8) {
    const tileSize = 8;
    const visibleSprites = sprites.filter(s => s.renderedPixels);
    const rows = Math.ceil(visibleSprites.length / tilesPerRow);
    const width = tilesPerRow * tileSize;
    const height = rows * tileSize;
    
    const png = new PNG({ width, height });
    
    for (let i = 0; i < visibleSprites.length; i++) {
      const sprite = visibleSprites[i];
      const row = Math.floor(i / tilesPerRow);
      const col = i % tilesPerRow;
      const palette = sprite.palette;
      
      for (let y = 0; y < sprite.height; y++) {
        for (let x = 0; x < sprite.width; x++) {
          const pixel = sprite.renderedPixels[y * sprite.width + x] || 0;
          const [r, g, b] = palette[pixel] || [0, 0, 0];
          
          const destX = col * tileSize + x;
          const destY = row * tileSize + y;
          const idx = (destY * width + destX) * 4;
          
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = pixel === 0 ? 0 : 255;
        }
      }
    }
    
    fs.writeFileSync(outputPath, PNG.sync.write(png));
    return outputPath;
  }

  static saveCHRTiles(tiles, palettes, outputDir, individual = false) {
    fs.mkdirSync(outputDir, { recursive: true });
    const results = [];
    const grayPalette = this.getGrayscalePalette();
    
    results.push(this.createSpriteSheet(tiles, grayPalette, path.join(outputDir, 'spritesheet_gray.png'), 8));
    
    for (let p = 0; p < 4; p++) {
      results.push(this.createSpriteSheet(tiles, palettes[p], path.join(outputDir, `spritesheet_palette${p}.png`), 8));
    }
    
    if (individual) {
      const grayDir = path.join(outputDir, 'gray');
      fs.mkdirSync(grayDir, { recursive: true });
      for (const tile of tiles) {
        PNGHandler.saveSprite(tile.data, path.join(grayDir, `tile_${String(tile.id).padStart(3, '0')}.png`), grayPalette);
      }
      
      for (let p = 0; p < 4; p++) {
        const palDir = path.join(outputDir, `palette${p}`);
        fs.mkdirSync(palDir, { recursive: true });
        for (const tile of tiles) {
          PNGHandler.saveSprite(tile.data, path.join(palDir, `tile_${String(tile.id).padStart(3, '0')}.png`), palettes[p]);
        }
      }
    }
    
    return results;
  }

  static saveOAMSprites(oamSprites, outputDir, individual = false) {
    fs.mkdirSync(outputDir, { recursive: true });
    const results = [];
    
    const visibleSprites = oamSprites.filter(s => s.visible && s.renderedPixels);
    
    results.push(this.createOAMSpriteSheet(oamSprites, path.join(outputDir, 'spritesheet.png'), 8));
    
    if (individual) {
      for (const sprite of visibleSprites) {
        const filename = `sprite_${String(sprite.id).padStart(2, '0')}.png`;
        PNGHandler.saveSprite(sprite.renderedPixels, path.join(outputDir, filename), sprite.palette, sprite.width, sprite.height);
        results.push(path.join(outputDir, filename));
      }
    }
    
    return results;
  }
}

module.exports = SpriteHandler;