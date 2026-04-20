const fs = require('fs');
const path = require('path');
const PNGHandler = require('./png');
const { JSONHandler } = require('../data/json-csv');

class SpriteHandler {
  static extractOAM(emulator) {
    const oam = emulator.getOAM();
    const sprites = [];
    
    for (let i = 0; i < 64; i++) {
      const offset = i * 4;
      sprites.push({
        id: i,
        y: oam[offset],
        tile: oam[offset + 1],
        attributes: oam[offset + 2],
        x: oam[offset + 3],
        palette: (oam[offset + 2] & 0x03) + 4,
        priority: (oam[offset + 2] & 0x20) >> 5,
        flipHorizontal: (oam[offset + 2] & 0x40) >> 6,
        flipVertical: (oam[offset + 2] & 0x80) >> 7
      });
    }
    
    return sprites;
  }

  static extractCHRTiles(romData, bank = 0) {
    const tiles = [];
    const chrSize = 0x2000; // 8KB per bank
    const offset = bank * chrSize;
    
    for (let tile = 0; tile < 256; tile++) {
      const tileOffset = offset + (tile * 16);
      const pixelData = new Array(64).fill(0);
      
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
      
      tiles.push({
        id: tile,
        data: pixelData
      });
    }
    
    return tiles;
  }

  static renderSpriteToBuffer(tileData, palette = [[0,0,0], [100,100,100], [200,200,200], [255,255,255]]) {
    const width = 8;
    const height = 8;
    const buffer = Buffer.alloc(width * height * 4);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = tileData[y * width + x];
        const color = palette[pixel] || [0, 0, 0];
        const idx = (y * width + x) * 4;
        
        buffer[idx] = color[0];
        buffer[idx + 1] = color[1];
        buffer[idx + 2] = color[2];
        buffer[idx + 3] = pixel === 0 ? 0 : 255;
      }
    }
    
    return buffer;
  }

  static saveSprites(sprites, outputDir, format = 'png') {
    fs.mkdirSync(outputDir, { recursive: true });
    const results = [];
    
    if (format === 'png' || format === 'all') {
      for (const sprite of sprites) {
        if (sprite.data) {
          const buffer = this.renderSpriteToBuffer(sprite.data);
          const filePath = path.join(outputDir, `sprite_${String(sprite.id).padStart(3, '0')}.png`);
          PNGHandler.save(buffer, filePath, 8, 8);
          results.push(filePath);
        }
      }
    }
    
    if (format === 'json' || format === 'all') {
      const jsonPath = path.join(outputDir, 'sprites.json');
      JSONHandler.save(sprites, jsonPath);
      results.push(jsonPath);
    }
    
    return results;
  }

  static createSpriteSheet(tiles, outputPath, tilesPerRow = 16) {
    const tileSize = 8;
    const rows = Math.ceil(tiles.length / tilesPerRow);
    const width = tilesPerRow * tileSize;
    const height = rows * tileSize;
    
    const { PNG } = require('pngjs');
    const png = new PNG({ width, height });
    
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const row = Math.floor(i / tilesPerRow);
      const col = i % tilesPerRow;
      
      for (let y = 0; y < tileSize; y++) {
        for (let x = 0; x < tileSize; x++) {
          const pixel = tile.data[y * tileSize + x];
          const color = pixel * 85;
          
          const destX = col * tileSize + x;
          const destY = row * tileSize + y;
          const idx = (destY * width + destX) * 4;
          
          png.data[idx] = color;
          png.data[idx + 1] = color;
          png.data[idx + 2] = color;
          png.data[idx + 3] = 255;
        }
      }
    }
    
    fs.writeFileSync(outputPath, PNG.sync.write(png));
    return outputPath;
  }
}

module.exports = SpriteHandler;
