const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const SpriteHandler = require('./spritesheet');

/**
 * Groups OAM sprites into composite characters ("metasprites").
 *
 * A character on the NES is almost never one sprite - Mario is four or six 8x16
 * sprites drawn adjacent. This finds those groups by proximity, keys them by
 * their tile-and-offset configuration so the same character is recognised
 * across frames, and renders the ones that recur.
 *
 * Rendering composites from pattern-table colour indices, not from the
 * framebuffer, so the result has genuine transparency and contains no
 * background.
 */
class MetaspriteAnalyzer {
  constructor(emulator, options = {}) {
    this.emulator = emulator;
    this.frameHistory = [];
    // Which sprites count as candidates. The defaults accept everything;
    // narrow them to skip a HUD or to isolate a character by palette.
    this.filter = {
      minY: options.minY == null ? 0 : options.minY,
      maxY: options.maxY == null ? 239 : options.maxY,
      palettes: options.palettes == null ? [0, 1, 2, 3] : options.palettes
    };
    // Proximity grouping is transitive, so a line of sprites - a row of coins,
    // a fence, a scrolling status strip - can chain into one cluster spanning
    // the screen. A character is small; anything larger than this is rejected
    // rather than written out as a tall smear.
    this.maxSize = {
      width: options.maxWidth == null ? 64 : options.maxWidth,
      height: options.maxHeight == null ? 64 : options.maxHeight
    };
    // Games park unused sprites off-screen, often all at the same coordinates.
    // Those stack into a cluster of dozens of sprites occupying one tile, which
    // is not a character. Real composite characters are a handful of sprites -
    // the PPU can only draw eight per scanline.
    this.maxSprites = options.maxSprites == null ? 16 : options.maxSprites;
  }

  captureFrame() {
    const sprites = SpriteHandler.extractOAM(this.emulator).filter((s) => s.visible);
    const candidates = sprites.filter(
      (s) =>
        s.screenY >= this.filter.minY &&
        s.screenY <= this.filter.maxY &&
        this.filter.palettes.includes(s.palette)
    );

    this.frameHistory.push({
      frame: this.emulator.frameCount,
      sprites,
      candidates,
      spriteHeight: this.emulator.is8x16Sprites() ? 16 : 8
    });

    return sprites;
  }

  runFrames(count, onFrame = null) {
    for (let i = 0; i < count; i++) {
      this.emulator.stepFrame();
      this.captureFrame();
      if (onFrame) onFrame(i, count);
    }
    return this.frameHistory;
  }

  /** Flood-fill sprites into groups whose bounding boxes are within maxGap. */
  clusterSpritesByPosition(sprites, maxGap = 8, spriteHeight = 16) {
    const clusters = [];
    const visited = new Set();

    for (const seed of sprites) {
      if (visited.has(seed.id)) continue;

      const cluster = [seed];
      visited.add(seed.id);

      let grew = true;
      while (grew) {
        grew = false;
        for (const other of sprites) {
          if (visited.has(other.id)) continue;

          const touches = cluster.some((member) => {
            const xGap = Math.abs(other.x - member.x) - 8;
            const yGap = Math.abs(other.screenY - member.screenY) - spriteHeight;
            return xGap <= maxGap && yGap <= maxGap;
          });

          if (touches) {
            cluster.push(other);
            visited.add(other.id);
            grew = true;
          }
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  getClusterBounds(cluster, spriteHeight = 16) {
    if (cluster.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const sprite of cluster) {
      minX = Math.min(minX, sprite.x);
      minY = Math.min(minY, sprite.screenY);
      maxX = Math.max(maxX, sprite.x + 8);
      maxY = Math.max(maxY, sprite.screenY + spriteHeight);
    }

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Composite a cluster onto a transparent canvas from pattern data.
   *
   * Sprites are drawn back-to-front: a lower OAM index has higher priority on
   * real hardware, so the highest indices are laid down first and the low ones
   * paint over them. Colour index 0 is skipped entirely, which is what leaves
   * the surrounding pixels transparent.
   */
  renderCluster(cluster, spriteHeight = 16) {
    const bounds = this.getClusterBounds(cluster, spriteHeight);
    if (!bounds) return null;

    const { minX, minY, width, height } = bounds;
    const png = new PNG({ width, height });
    png.data.fill(0);

    const backToFront = [...cluster].sort((a, b) => b.id - a.id);

    for (const sprite of backToFront) {
      const { pixels } = SpriteHandler.getSpritePixels(this.emulator, sprite);
      const palette = this.emulator.getSpritePalette(sprite.palette);

      for (let py = 0; py < spriteHeight; py++) {
        for (let px = 0; px < 8; px++) {
          const pixel = pixels[py * 8 + px] || 0;
          if (pixel === 0) continue; // transparent on hardware

          const destX = sprite.x - minX + px;
          const destY = sprite.screenY - minY + py;
          if (destX < 0 || destX >= width || destY < 0 || destY >= height) continue;

          const [r, g, b] = palette[pixel] || [0, 0, 0];
          const idx = (destY * width + destX) * 4;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 255;
        }
      }
    }

    return { png, bounds, spriteCount: cluster.length };
  }

  /**
   * Step the emulator and collect recurring metasprites.
   *
   * Each frame is clustered and rendered as it happens, not afterwards. That
   * ordering is required for bank-switching mappers: the pattern tables hold
   * this frame's tiles only while this frame is current, so a render deferred
   * to the end of the run would draw whatever bank happened to be loaded last.
   */
  analyzeMetasprites(frameCount = 60, maxGap = 8, minSprites = 2) {
    this.frameHistory = [];
    const candidates = new Map();

    for (let i = 0; i < frameCount; i++) {
      this.emulator.stepFrame();
      this.captureFrame();

      const frame = this.frameHistory[this.frameHistory.length - 1];
      const clusters = this.clusterSpritesByPosition(
        frame.candidates,
        maxGap,
        frame.spriteHeight
      );

      for (const cluster of clusters) {
        if (cluster.length < minSprites) continue;

        const bounds = this.getClusterBounds(cluster, frame.spriteHeight);
        if (
          cluster.length > this.maxSprites ||
          bounds.width > this.maxSize.width ||
          bounds.height > this.maxSize.height
        ) {
          continue;
        }

        const key = this.getSpriteConfigurationKey(cluster, bounds);

        if (!candidates.has(key)) {
          const rendered = this.renderCluster(cluster, frame.spriteHeight);
          if (!rendered) continue;

          candidates.set(key, {
            key,
            width: bounds.width,
            height: bounds.height,
            tiles: cluster.map((s) => s.tile).sort((a, b) => a - b),
            spriteCount: cluster.length,
            spriteHeight: frame.spriteHeight,
            // Which sprite palette the group is drawn with. Games usually give
            // each character its own, so this is a serviceable stand-in for
            // "who is this" - it is what separates Mario from Luigi.
            palette: this.dominantPalette(cluster),
            png: rendered.png,
            firstFrame: frame.frame,
            occurrences: 0
          });
        }

        candidates.get(key).occurrences += 1;
      }
    }

    return Array.from(candidates.values())
      .filter((m) => m.occurrences >= 2)
      .sort((a, b) => b.occurrences - a.occurrences);
  }

  /** The palette most of a cluster's sprites are drawn with. */
  dominantPalette(cluster) {
    const counts = new Map();
    for (const sprite of cluster) {
      counts.set(sprite.palette, (counts.get(sprite.palette) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  getSpriteConfiguration(cluster, bounds) {
    return cluster
      .map((s) => ({
        tile: s.tile,
        relX: s.x - bounds.minX,
        relY: s.screenY - bounds.minY,
        flipH: s.flipHorizontal,
        flipV: s.flipVertical,
        palette: s.palette
      }))
      .sort((a, b) => a.relY - b.relY || a.relX - b.relX || a.tile - b.tile);
  }

  /**
   * Identity of a metasprite: its size plus each member's tile and offset.
   * Two frames showing the same character in the same pose share a key even if
   * the character has moved across the screen.
   */
  getSpriteConfigurationKey(cluster, bounds) {
    const config = this.getSpriteConfiguration(cluster, bounds);
    const parts = config.map((c) => `${c.tile}:${c.palette}:${c.flipH}${c.flipV}@${c.relX},${c.relY}`);
    return `${bounds.width}x${bounds.height}|${parts.join(';')}`;
  }

  /** Take the most frequently seen metasprites, already rendered. */
  extractBestMetasprites(metasprites, maxCount = 20) {
    return metasprites.slice(0, maxCount).map((meta, id) => ({
      id,
      key: meta.key,
      width: meta.width,
      height: meta.height,
      spriteCount: meta.spriteCount,
      tiles: meta.tiles,
      occurrences: meta.occurrences,
      firstFrame: meta.firstFrame,
      palette: meta.palette,
      png: meta.png
    }));
  }

  /**
   * Tile metasprites into one sheet.
   *
   * Cells are uniform - the largest pose sets the size - and each pose is
   * centred horizontally and sat on the bottom of its cell, so a character's
   * feet line up across the row the way a hand-made sprite sheet would. The
   * background stays fully transparent; this is an asset, not a preview.
   *
   * The poses within a sheet are ordered by how often each was seen, not by
   * time. Putting them in animation order means tracking a character across
   * frames, which is a different job - see --format animation.
   */
  static saveSheet(metasprites, outputPath, columns = 8) {
    if (metasprites.length === 0) {
      return null;
    }

    const cellW = Math.max(...metasprites.map((m) => m.width));
    const cellH = Math.max(...metasprites.map((m) => m.height));
    const perRow = Math.min(columns, metasprites.length);
    const rows = Math.ceil(metasprites.length / perRow);

    const sheet = new PNG({ width: perRow * cellW, height: rows * cellH });
    sheet.data.fill(0);

    metasprites.forEach((meta, i) => {
      const originX = (i % perRow) * cellW + Math.floor((cellW - meta.width) / 2);
      const originY = Math.floor(i / perRow) * cellH + (cellH - meta.height);

      for (let y = 0; y < meta.height; y++) {
        for (let x = 0; x < meta.width; x++) {
          const src = (y * meta.width + x) * 4;
          if (meta.png.data[src + 3] === 0) continue;

          const dst = ((originY + y) * sheet.width + originX + x) * 4;
          sheet.data[dst] = meta.png.data[src];
          sheet.data[dst + 1] = meta.png.data[src + 1];
          sheet.data[dst + 2] = meta.png.data[src + 2];
          sheet.data[dst + 3] = 255;
        }
      }
    });

    fs.writeFileSync(outputPath, PNG.sync.write(sheet));
    return { path: outputPath, cellWidth: cellW, cellHeight: cellH, columns: perRow, rows };
  }

  saveMetasprites(metasprites, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    const metadata = [];

    for (const meta of metasprites) {
      const filename = `metasprite_${String(meta.id).padStart(3, '0')}.png`;
      fs.writeFileSync(path.join(outputDir, filename), PNG.sync.write(meta.png));

      metadata.push({
        id: meta.id,
        filename,
        width: meta.width,
        height: meta.height,
        spriteCount: meta.spriteCount,
        tiles: meta.tiles,
        occurrences: meta.occurrences,
        firstFrame: meta.firstFrame,
        palette: meta.palette
      });
    }

    fs.writeFileSync(
      path.join(outputDir, 'metasprites.json'),
      JSON.stringify(metadata, null, 2)
    );

    return metadata;
  }
}

module.exports = MetaspriteAnalyzer;
