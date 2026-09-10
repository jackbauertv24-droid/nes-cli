const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const PNGHandler = require('./png');

/**
 * Sprite extraction.
 *
 * Everything here composites from NES colour *indices* and only converts to
 * RGB at the last moment. That ordering matters: index 0 is transparency and
 * index 3 is frequently an outline, and on most palettes both resolve to the
 * same black. Any approach that flattens to RGB first - such as scraping the
 * rendered framebuffer - cannot tell them apart afterwards, and also drags in
 * whatever background happened to be behind the sprite.
 */
class SpriteHandler {
  /** Decode OAM into 64 sprite records. */
  static extractOAM(emulator) {
    const oam = emulator.getOAM();
    const sprites = [];

    for (let i = 0; i < 64; i++) {
      const offset = i * 4;
      const oamY = oam[offset];
      const attributes = oam[offset + 2];

      sprites.push({
        id: i,
        y: oamY,
        // OAM stores screenY - 1; the PPU adds it back when it draws.
        screenY: oamY + 1,
        tile: oam[offset + 1],
        attributes,
        x: oam[offset + 3],
        palette: attributes & 0x03,
        priority: (attributes & 0x20) >> 5,
        flipHorizontal: (attributes & 0x40) >> 6,
        flipVertical: (attributes & 0x80) >> 7,
        // A sprite parked at y >= 239 is off-screen; games hide sprites there.
        visible: oamY < 239
      });
    }

    return sprites;
  }

  /**
   * Build the colour-index bitmap for one sprite, honouring sprite size, which
   * pattern table it comes from, and both flip bits.
   */
  static getSpritePixels(emulator, sprite) {
    const { table, tiles } = emulator.resolveSpriteTiles(sprite.tile);
    const height = tiles.length * 8;
    let pixels = [];

    for (const tile of tiles) {
      pixels = pixels.concat(emulator.getPatternTile(table, tile));
    }

    if (sprite.flipHorizontal) {
      pixels = this.flipHorizontal(pixels, 8, height);
    }
    if (sprite.flipVertical) {
      // A vertical flip of an 8x16 sprite mirrors the whole 16 rows, which
      // swaps the two tiles as well as reversing each one.
      pixels = this.flipVertical(pixels, 8, height);
    }

    return { pixels, width: 8, height };
  }

  static extractOAMWithImages(emulator) {
    return this.extractOAM(emulator).map((sprite) => {
      const height = emulator.is8x16Sprites() ? 16 : 8;

      if (!sprite.visible) {
        return { ...sprite, renderedPixels: null, width: 8, height };
      }

      const { pixels, width } = this.getSpritePixels(emulator, sprite);
      return {
        ...sprite,
        renderedPixels: pixels,
        paletteColors: emulator.getSpritePalette(sprite.palette),
        width,
        height
      };
    });
  }

  static flipHorizontal(pixelData, width, height) {
    const flipped = new Array(pixelData.length).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        flipped[y * width + (width - 1 - x)] = pixelData[y * width + x];
      }
    }
    return flipped;
  }

  static flipVertical(pixelData, width, height) {
    const flipped = new Array(pixelData.length).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        flipped[(height - 1 - y) * width + x] = pixelData[y * width + x];
      }
    }
    return flipped;
  }

  /** Read every tile of one live pattern table as colour indices. */
  static extractPatternTable(emulator, table) {
    const tiles = [];
    for (let id = 0; id < 256; id++) {
      tiles.push({ id, table, data: emulator.getPatternTile(table, id) });
    }
    return tiles;
  }

  static getGrayscalePalette() {
    return [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]];
  }

  /** Lay tiles out in a grid. Cell size follows the tiles, not a constant. */
  static createSpriteSheet(tiles, palette, outputPath, tilesPerRow = 16) {
    const rows = Math.ceil(tiles.length / tilesPerRow);
    const width = tilesPerRow * 8;
    const height = rows * 8;
    const png = new PNG({ width, height });

    tiles.forEach((tile, i) => {
      const originX = (i % tilesPerRow) * 8;
      const originY = Math.floor(i / tilesPerRow) * 8;

      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const pixel = tile.data[y * 8 + x] || 0;
          const [r, g, b] = palette[pixel] || [0, 0, 0];
          const idx = ((originY + y) * width + originX + x) * 4;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = pixel === 0 ? 0 : 255;
        }
      }
    });

    fs.writeFileSync(outputPath, PNG.sync.write(png));
    return outputPath;
  }

  /**
   * Lay visible OAM sprites out in a grid, each drawn with its own palette.
   * Cells are sized to the tallest sprite so 8x16 sprites are not clipped -
   * the previous version used fixed 8px cells and the rows overwrote each
   * other, which is why the old spritesheet.png looked like noise.
   */
  static createOAMSpriteSheet(sprites, outputPath, spritesPerRow = 16) {
    const drawable = sprites.filter((s) => s.renderedPixels);
    if (drawable.length === 0) {
      return null;
    }

    const cellW = Math.max(...drawable.map((s) => s.width));
    const cellH = Math.max(...drawable.map((s) => s.height));
    const rows = Math.ceil(drawable.length / spritesPerRow);
    const width = spritesPerRow * cellW;
    const height = rows * cellH;
    const png = new PNG({ width, height });

    drawable.forEach((sprite, i) => {
      const originX = (i % spritesPerRow) * cellW;
      const originY = Math.floor(i / spritesPerRow) * cellH;
      const palette = sprite.paletteColors;

      for (let y = 0; y < sprite.height; y++) {
        for (let x = 0; x < sprite.width; x++) {
          const pixel = sprite.renderedPixels[y * sprite.width + x] || 0;
          const [r, g, b] = palette[pixel] || [0, 0, 0];
          const idx = ((originY + y) * width + originX + x) * 4;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = pixel === 0 ? 0 : 255;
        }
      }
    });

    fs.writeFileSync(outputPath, PNG.sync.write(png));
    return outputPath;
  }

  static savePatternTables(emulator, outputDir, individual = false) {
    fs.mkdirSync(outputDir, { recursive: true });
    const palettes = emulator.getAllSpritePalettes();
    const gray = this.getGrayscalePalette();
    const results = [];

    for (const table of [0, 1]) {
      const tiles = this.extractPatternTable(emulator, table);
      results.push(
        this.createSpriteSheet(tiles, gray, path.join(outputDir, `table${table}_gray.png`))
      );

      for (let p = 0; p < 4; p++) {
        results.push(
          this.createSpriteSheet(
            tiles,
            palettes[p],
            path.join(outputDir, `table${table}_palette${p}.png`)
          )
        );
      }

      if (individual) {
        const tileDir = path.join(outputDir, `table${table}`);
        fs.mkdirSync(tileDir, { recursive: true });
        for (const tile of tiles) {
          PNGHandler.saveSprite(
            tile.data,
            path.join(tileDir, `tile_${String(tile.id).padStart(3, '0')}.png`),
            gray
          );
        }
      }
    }

    return results;
  }

  static saveOAMSprites(oamSprites, outputDir, individual = false) {
    fs.mkdirSync(outputDir, { recursive: true });
    const results = [];
    const sheet = this.createOAMSpriteSheet(oamSprites, path.join(outputDir, 'spritesheet.png'));

    if (sheet) {
      results.push(sheet);
    }

    if (individual) {
      for (const sprite of oamSprites.filter((s) => s.renderedPixels)) {
        const filename = `sprite_${String(sprite.id).padStart(2, '0')}.png`;
        PNGHandler.saveSprite(
          sprite.renderedPixels,
          path.join(outputDir, filename),
          sprite.paletteColors,
          sprite.width,
          sprite.height
        );
        results.push(path.join(outputDir, filename));
      }
    }

    return results;
  }
}

module.exports = SpriteHandler;
