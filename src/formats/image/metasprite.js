const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

class MetaspriteAnalyzer {
  constructor(emulator) {
    this.emulator = emulator;
    this.frameHistory = [];
  }

  captureFrame() {
    const oam = this.emulator.getOAM();
    const sprites = [];
    
    for (let i = 0; i < 64; i++) {
      const offset = i * 4;
      const y = oam[offset];
      const screenY = y < 240 ? y + 1 : y;
      
      sprites.push({
        id: i,
        y: y,
        screenY: screenY,
        tile: oam[offset + 1],
        attributes: oam[offset + 2],
        x: oam[offset + 3],
        palette: (oam[offset + 2] & 0x03),
        flipH: (oam[offset + 2] & 0x40) >> 6,
        flipV: (oam[offset + 2] & 0x80) >> 7,
        visible: y < 240
      });
    }
    
    const visibleSprites = sprites.filter(s => s.visible);
    const frameNum = this.emulator.frameCount;
    
    this.frameHistory.push({
      frame: frameNum,
      sprites: visibleSprites,
      gameplaySprites: visibleSprites.filter(s => s.screenY > 140 && (s.palette === 0 || s.palette === 1))
    });
    
    return visibleSprites;
  }

  runFrames(count, onFrame = null) {
    for (let i = 0; i < count; i++) {
      this.emulator.stepFrame();
      this.captureFrame();
      if (onFrame) onFrame(i, count);
    }
    return this.frameHistory;
  }

  clusterSpritesByPosition(sprites, maxGap = 16) {
    if (sprites.length === 0) return [];
    
    const clusters = [];
    const visited = new Set();
    const spriteHeight = 16; // 8x16 mode
    
    for (const sprite of sprites) {
      if (visited.has(sprite.id)) continue;
      
      const cluster = [sprite];
      visited.add(sprite.id);
      
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const other of sprites) {
          if (visited.has(other.id)) continue;
          
          for (const member of cluster) {
            const xDist = Math.abs(other.x - member.x);
            const yDist = Math.abs(other.screenY - member.screenY);
            
            if (xDist <= maxGap + 8 && yDist <= maxGap + spriteHeight) {
              cluster.push(other);
              visited.add(other.id);
              expanded = true;
              break;
            }
          }
        }
      }
      
      clusters.push(cluster);
    }
    
    return clusters;
  }

  getClusterBounds(cluster) {
    if (cluster.length === 0) return null;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const sprite of cluster) {
      minX = Math.min(minX, sprite.x);
      minY = Math.min(minY, sprite.screenY);
      maxX = Math.max(maxX, sprite.x + 8);
      maxY = Math.max(maxY, sprite.screenY + 16);
    }
    
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  renderClusterFromFramebuffer(cluster) {
    const bounds = this.getClusterBounds(cluster);
    if (!bounds) return null;
    
    const { minX, minY, width, height } = bounds;
    const png = new PNG({ width, height });
    
    const fb = this.emulator.getFrameBuffer();
    const sortedCluster = [...cluster].sort((a, b) => a.id - b.id);
    
    for (const sprite of sortedCluster) {
      const relX = sprite.x - minX;
      const relY = sprite.screenY - minY;
      
      for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 8; px++) {
          const srcY = sprite.screenY + py;
          const srcX = sprite.x + px;
          
          if (srcY >= 240 || srcX >= 256) continue;
          
          const rgb = fb[srcY * 256 + srcX];
          const r = (rgb >> 16) & 0xFF;
          const g = (rgb >> 8) & 0xFF;
          const b = rgb & 0xFF;
          
          const destX = relX + px;
          const destY = relY + py;
          const idx = (destY * width + destX) * 4;
          
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 255; // All pixels visible (no filtering)
        }
      }
    }
    
    return { png, bounds, spriteCount: cluster.length };
  }

  analyzeMetasprites(frameCount = 60, maxGap = 16, minSprites = 2) {
    console.log(`Analyzing ${frameCount} frames for metasprites...`);
    
    this.frameHistory = [];
    this.runFrames(frameCount);
    
    const metaspriteCandidates = new Map();
    const frameData = this.frameHistory;
    
    for (let i = 0; i < frameData.length; i++) {
      const frame = frameData[i];
      const spritesToAnalyze = frame.gameplaySprites || frame.sprites;
      const clusters = this.clusterSpritesByPosition(spritesToAnalyze, maxGap);
      
      for (const cluster of clusters) {
        if (cluster.length < minSprites) continue;
        
        const bounds = this.getClusterBounds(cluster);
        const configKey = this.getSpriteConfigurationKey(cluster, bounds);
        
        if (!metaspriteCandidates.has(configKey)) {
          metaspriteCandidates.set(configKey, {
            key: configKey,
            width: bounds.width,
            height: bounds.height,
            tiles: cluster.map(s => s.tile).sort((a, b) => a - b),
            occurrences: [],
            firstFrame: i,
            spriteConfig: this.getSpriteConfiguration(cluster, bounds)
          });
        }
        
        const candidate = metaspriteCandidates.get(configKey);
        candidate.occurrences.push({
          frame: i,
          cluster: cluster,
          bounds
        });
      }
    }
    
    const metasprites = Array.from(metaspriteCandidates.values())
      .filter(m => m.occurrences.length >= 2)
      .sort((a, b) => b.occurrences.length - a.occurrences.length);
    
    console.log(`Found ${metasprites.length} metasprite candidates`);
    
    return metasprites;
  }

  getSpriteConfiguration(cluster, bounds) {
    return cluster.map(s => ({
      tile: s.tile,
      relX: s.x - bounds.minX,
      relY: s.screenY - bounds.minY,
      flipH: s.flipH,
      flipV: s.flipV,
      palette: s.palette
    })).sort((a, b) => a.relY * 100 + a.relX - b.relY * 100 - b.relX);
  }

  getSpriteConfigurationKey(cluster, bounds) {
    const config = this.getSpriteConfiguration(cluster, bounds);
    const sizeKey = `${bounds.width}x${bounds.height}`;
    const posKey = config.map(c => `${c.tile}@${c.relX},${c.relY}`).join(';');
    return `${sizeKey}:${posKey}`;
  }

  extractBestMetasprites(metasprites, maxCount = 20) {
    const extracted = [];
    const usedKeys = new Set();
    
    for (const meta of metasprites) {
      if (extracted.length >= maxCount) break;
      if (usedKeys.has(meta.key)) continue;
      
      const bestOccurrence = meta.occurrences[0];
      const rendered = this.renderClusterFromFramebuffer(bestOccurrence.cluster);
      
      if (rendered && rendered.bounds.width > 8 && rendered.bounds.height > 8) {
        extracted.push({
          id: extracted.length,
          key: meta.key,
          width: rendered.bounds.width,
          height: rendered.bounds.height,
          spriteCount: meta.tiles.length,
          tiles: meta.tiles,
          occurrences: meta.occurrences.length,
          png: rendered.png,
          cluster: bestOccurrence.cluster
        });
        usedKeys.add(meta.key);
      }
    }
    
    return extracted;
  }

  saveMetasprites(metasprites, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    
    const results = [];
    const metadata = [];
    
    for (const meta of metasprites) {
      const filename = `metasprite_${String(meta.id).padStart(3, '0')}.png`;
      const filepath = path.join(outputDir, filename);
      
      fs.writeFileSync(filepath, PNG.sync.write(meta.png));
      results.push(filepath);
      
      metadata.push({
        id: meta.id,
        filename,
        width: meta.width,
        height: meta.height,
        spriteCount: meta.spriteCount,
        tiles: meta.tiles,
        occurrences: meta.occurrences
      });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'metasprites.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    console.log(`Saved ${metasprites.length} metasprites to ${outputDir}`);
    
    return results;
  }
}

module.exports = MetaspriteAnalyzer;