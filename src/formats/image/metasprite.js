const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const SpriteHandler = require('./spritesheet');

class MetaspriteAnalyzer {
  constructor(emulator) {
    this.emulator = emulator;
    this.frameHistory = [];
    this.metasprites = new Map();
  }

  captureFrame() {
    const oamSprites = SpriteHandler.extractOAMWithImages(this.emulator);
    const visibleSprites = oamSprites.filter(s => s.visible && s.renderedPixels);
    const frameNum = this.emulator.frameCount;
    
    this.frameHistory.push({
      frame: frameNum,
      sprites: visibleSprites.map(s => ({
        id: s.id,
        x: s.x,
        y: s.y,
        tile: s.tile,
        palette: s.palette,
        flipH: s.flipHorizontal,
        flipV: s.flipVertical,
        renderedPixels: s.renderedPixels,
        width: s.width,
        height: s.height,
        paletteData: s.palette
      }))
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
            const yDist = Math.abs(other.y - member.y);
            
            if (xDist <= maxGap + member.width && yDist <= maxGap + member.height) {
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
      minY = Math.min(minY, sprite.y);
      maxX = Math.max(maxX, sprite.x + sprite.width);
      maxY = Math.max(maxY, sprite.y + sprite.height);
    }
    
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  renderCluster(cluster) {
    const bounds = this.getClusterBounds(cluster);
    if (!bounds) return null;
    
    const { minX, minY, width, height } = bounds;
    const png = new PNG({ width, height });
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
    
    const sortedCluster = [...cluster].sort((a, b) => a.id - b.id);
    
    for (const sprite of sortedCluster) {
      const relX = sprite.x - minX;
      const relY = sprite.y - minY;
      
      for (let py = 0; py < sprite.height; py++) {
        for (let px = 0; px < sprite.width; px++) {
          const pixel = sprite.renderedPixels[py * sprite.width + px] || 0;
          if (pixel === 0) continue;
          
          const [r, g, b] = sprite.paletteData[pixel] || [0, 0, 0];
          
          const destX = relX + px;
          const destY = relY + py;
          
          if (destX >= 0 && destX < width && destY >= 0 && destY < height) {
            const idx = (destY * width + destX) * 4;
            png.data[idx] = r;
            png.data[idx + 1] = g;
            png.data[idx + 2] = b;
            png.data[idx + 3] = 255;
          }
        }
      }
    }
    
    return { png, bounds, spriteCount: cluster.length };
  }

  saveClusterPNG(cluster, outputPath) {
    const rendered = this.renderCluster(cluster);
    if (!rendered) return null;
    
    fs.writeFileSync(outputPath, PNG.sync.write(rendered.png));
    return outputPath;
  }

  analyzeMetasprites(frameCount = 60, maxGap = 16, minSprites = 2) {
    console.log(`Analyzing ${frameCount} frames for metasprites...`);
    
    this.frameHistory = [];
    this.runFrames(frameCount);
    
    const metaspriteCandidates = new Map();
    const frameData = this.frameHistory;
    
    for (let i = 0; i < frameData.length; i++) {
      const frame = frameData[i];
      const clusters = this.clusterSpritesByPosition(frame.sprites, maxGap);
      
      for (const cluster of clusters) {
        if (cluster.length < minSprites) continue;
        
        const bounds = this.getClusterBounds(cluster);
        const sizeKey = `${bounds.width}x${bounds.height}`;
        const tileKey = cluster.map(s => s.tile).sort((a, b) => a - b).join(',');
        const metaKey = `${sizeKey}:${tileKey}`;
        
        if (!metaspriteCandidates.has(metaKey)) {
          metaspriteCandidates.set(metaKey, {
            key: metaKey,
            width: bounds.width,
            height: bounds.height,
            tiles: cluster.map(s => s.tile),
            occurrences: [],
            firstFrame: i
          });
        }
        
        const candidate = metaspriteCandidates.get(metaKey);
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

  trackAnimations(frameCount = 120, maxGap = 16, minSprites = 2) {
    console.log(`Tracking animations over ${frameCount} frames...`);
    
    this.frameHistory = [];
    this.runFrames(frameCount);
    
    const animationTracks = new Map();
    const frameData = this.frameHistory;
    
    for (let i = 0; i < frameData.length; i++) {
      const frame = frameData[i];
      const clusters = this.clusterSpritesByPosition(frame.sprites, maxGap);
      
      for (const cluster of clusters) {
        if (cluster.length < minSprites) continue;
        
        const bounds = this.getClusterBounds(cluster);
        const posKey = `${Math.round(bounds.minX / 16)}_${Math.round(bounds.minY / 16)}`;
        
        if (!animationTracks.has(posKey)) {
          animationTracks.set(posKey, {
            positionKey: posKey,
            frames: []
          });
        }
        
        const track = animationTracks.get(posKey);
        track.frames.push({
          frameNum: i,
          cluster,
          bounds,
          tiles: cluster.map(s => s.tile).sort((a, b) => a - b)
        });
      }
    }
    
    const animations = [];
    for (const [key, track] of animationTracks) {
      if (track.frames.length < 3) continue;
      
      const tileSets = new Map();
      for (const f of track.frames) {
        const tileKey = f.tiles.join(',');
        if (!tileSets.has(tileKey)) {
          tileSets.set(tileKey, { tileKey, occurrences: [] });
        }
        tileSets.get(tileKey).occurrences.push(f);
      }
      
      const uniqueFrames = Array.from(tileSets.values())
        .filter(t => t.occurrences.length >= 1)
        .sort((a, b) => a.occurrences[0].frameNum - b.occurrences[0].frameNum);
      
      if (uniqueFrames.length >= 2) {
        animations.push({
          positionKey: key,
          frameCount: uniqueFrames.length,
          frames: uniqueFrames.map(u => ({
            frameNum: u.occurrences[0].frameNum,
            tiles: u.occurrences[0].tiles,
            cluster: u.occurrences[0].cluster,
            bounds: u.occurrences[0].bounds
          }))
        });
      }
    }
    
    animations.sort((a, b) => b.frameCount - a.frameCount);
    
    console.log(`Found ${animations.length} animation tracks`);
    
    return animations;
  }

  extractBestMetasprites(metasprites, maxCount = 20) {
    const extracted = [];
    const usedKeys = new Set();
    
    for (const meta of metasprites) {
      if (extracted.length >= maxCount) break;
      if (usedKeys.has(meta.key)) continue;
      
      const bestOccurrence = meta.occurrences[0];
      const rendered = this.renderCluster(bestOccurrence.cluster);
      
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

  extractAnimations(animations, maxCount = 10) {
    const extracted = [];
    
    for (const anim of animations) {
      if (extracted.length >= maxCount) break;
      
      const frames = [];
      for (const f of anim.frames) {
        const rendered = this.renderCluster(f.cluster);
        if (rendered) {
          frames.push({
            frameNum: f.frameNum,
            png: rendered.png,
            bounds: rendered.bounds
          });
        }
      }
      
      if (frames.length >= 2) {
        extracted.push({
          id: extracted.length,
          positionKey: anim.positionKey,
          frameCount: frames.length,
          frames
        });
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

  saveAnimations(animations, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    
    const results = [];
    const metadata = [];
    
    for (const anim of animations) {
      const animDir = path.join(outputDir, `animation_${String(anim.id).padStart(3, '0')}`);
      fs.mkdirSync(animDir, { recursive: true });
      
      const frameFiles = [];
      for (let i = 0; i < anim.frames.length; i++) {
        const frame = anim.frames[i];
        const filename = `frame_${String(i).padStart(2, '0')}.png`;
        const filepath = path.join(animDir, filename);
        
        fs.writeFileSync(filepath, PNG.sync.write(frame.png));
        frameFiles.push(filename);
      }
      
      const spritesheet = this.createAnimationSpritesheet(anim.frames, animDir);
      
      results.push({ animDir, spritesheet });
      
      metadata.push({
        id: anim.id,
        positionKey: anim.positionKey,
        frameCount: anim.frameCount,
        frames: frameFiles,
        spritesheet
      });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'animations.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    console.log(`Saved ${animations.length} animations to ${outputDir}`);
    
    return results;
  }

  createAnimationSpritesheet(frames, outputDir) {
    if (frames.length === 0) return null;
    
    const maxWidth = Math.max(...frames.map(f => f.bounds.width));
    const maxHeight = Math.max(...frames.map(f => f.bounds.height));
    
    const spritesheet = new PNG({
      width: maxWidth * frames.length,
      height: maxHeight
    });
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const offsetX = i * maxWidth;
      
      for (let y = 0; y < maxHeight; y++) {
        for (let x = 0; x < maxWidth; x++) {
          const destIdx = (y * maxWidth * frames.length + offsetX + x) * 4;
          
          if (x < frame.bounds.width && y < frame.bounds.height) {
            const srcIdx = (y * frame.bounds.width + x) * 4;
            spritesheet.data[destIdx] = frame.png.data[srcIdx];
            spritesheet.data[destIdx + 1] = frame.png.data[srcIdx + 1];
            spritesheet.data[destIdx + 2] = frame.png.data[srcIdx + 2];
            spritesheet.data[destIdx + 3] = frame.png.data[srcIdx + 3];
          } else {
            spritesheet.data[destIdx] = 0;
            spritesheet.data[destIdx + 1] = 0;
            spritesheet.data[destIdx + 2] = 0;
            spritesheet.data[destIdx + 3] = 0;
          }
        }
      }
    }
    
    const filepath = path.join(outputDir, 'spritesheet.png');
    fs.writeFileSync(filepath, PNG.sync.write(spritesheet));
    
    return 'spritesheet.png';
  }
}

module.exports = MetaspriteAnalyzer;