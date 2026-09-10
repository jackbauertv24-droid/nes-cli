const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const MetaspriteAnalyzer = require('./metasprite');

const DEFAULTS = {
  // A pose held for fewer frames than this is treated as a transient - a
  // one-frame flicker between two real poses - and dropped.
  minHold: 2,
  // A track showing only one pose is a stationary object, not an animation.
  minPoses: 2,
  // How far a character may move between two frames and still be the same one.
  // A fast NES character covers a few pixels per frame; 24 is generous.
  maxMove: 24,
  // How many frames a character may be absent before its clip is closed.
  // Games blink sprites during invulnerability, so one or two is normal.
  maxMisses: 2,
  maxClips: 10,
  columns: 16
};

/**
 * Follows characters from frame to frame and records the poses they move
 * through, in order, with how long each was held.
 *
 * This is the part that `--format metasprite` deliberately does not do.
 * Metasprite extraction groups sprites *within* a frame and then throws time
 * away, which answers "which distinct poses appear here". Animation has to link
 * those groups *across* frames - to know that the character in frame 101 is the
 * one from frame 100 - which is what makes an ordered timeline possible.
 *
 * Identity is decided in three steps, strongest signal first: a candidate must
 * share the character's sprite palette; then overlapping OAM slots are strong
 * evidence, because games usually keep a character in the same slots for as
 * long as it exists; and failing that, the nearest centre within maxMove. The
 * position fallback is what carries games that re-sort OAM to spread flicker.
 */
class AnimationTracker {
  constructor(emulator, options = {}) {
    this.emulator = emulator;
    this.analyzer = new MetaspriteAnalyzer(emulator, options);

    this.minHold = options.minHold == null ? DEFAULTS.minHold : options.minHold;
    this.minPoses = options.minPoses == null ? DEFAULTS.minPoses : options.minPoses;
    this.maxMove = options.maxMove == null ? DEFAULTS.maxMove : options.maxMove;
    this.maxMisses = options.maxMisses == null ? DEFAULTS.maxMisses : options.maxMisses;
    this.maxClips = options.maxClips == null ? DEFAULTS.maxClips : options.maxClips;

    this.nextTrackId = 0;
  }

  /** Describe every plausible character group on the current frame. */
  groupsThisFrame(maxGap, minSprites) {
    // captureFrame appends to the analyzer's history; we only ever want the
    // current frame, so clear it rather than accumulate hundreds of entries.
    this.analyzer.frameHistory = [];
    this.analyzer.captureFrame();
    const frame = this.analyzer.frameHistory[0];

    const groups = [];
    for (const cluster of this.analyzer.clusterSpritesByPosition(
      frame.candidates,
      maxGap,
      frame.spriteHeight
    )) {
      if (cluster.length < minSprites) continue;

      const bounds = this.analyzer.getClusterBounds(cluster, frame.spriteHeight);
      if (!this.analyzer.isPlausibleCharacter(cluster, bounds)) continue;

      groups.push({
        cluster,
        bounds,
        spriteHeight: frame.spriteHeight,
        key: this.analyzer.getSpriteConfigurationKey(cluster, bounds),
        palette: this.analyzer.dominantPalette(cluster),
        oam: cluster.map((s) => s.id).sort((a, b) => a - b),
        x: bounds.minX,
        y: bounds.minY,
        centreX: (bounds.minX + bounds.maxX) / 2,
        centreY: (bounds.minY + bounds.maxY) / 2
      });
    }

    return groups;
  }

  /** Score how well a group could be the continuation of a track. Null if not. */
  matchScore(track, group) {
    if (track.palette !== group.palette) {
      return null;
    }

    const overlap = group.oam.filter((id) => track.oam.includes(id)).length;
    const distance = Math.hypot(group.centreX - track.centreX, group.centreY - track.centreY);

    // Shared OAM slots outweigh distance: a character that teleports across the
    // screen but keeps its slots is still that character, while two identical
    // enemies standing near each other are not.
    if (overlap === 0 && distance > this.maxMove) {
      return null;
    }

    return { overlap, distance };
  }

  /** Attach this frame's groups to open tracks, greedily, best match first. */
  assign(open, groups, frameNumber) {
    const pairs = [];

    for (const track of open) {
      for (const group of groups) {
        const score = this.matchScore(track, group);
        if (score) pairs.push({ track, group, ...score });
      }
    }

    pairs.sort((a, b) => b.overlap - a.overlap || a.distance - b.distance);

    const usedTracks = new Set();
    const usedGroups = new Set();

    for (const pair of pairs) {
      if (usedTracks.has(pair.track) || usedGroups.has(pair.group)) continue;
      usedTracks.add(pair.track);
      usedGroups.add(pair.group);
      this.extend(pair.track, pair.group, frameNumber);
    }

    for (const track of open) {
      if (!usedTracks.has(track)) track.misses += 1;
    }

    for (const group of groups) {
      if (!usedGroups.has(group)) open.push(this.begin(group, frameNumber));
    }
  }

  begin(group, frameNumber) {
    const track = {
      id: this.nextTrackId++,
      palette: group.palette,
      firstFrame: frameNumber,
      lastFrame: frameNumber,
      misses: 0,
      oam: group.oam,
      centreX: group.centreX,
      centreY: group.centreY,
      poses: new Map(),
      runs: []
    };

    this.extend(track, group, frameNumber);
    return track;
  }

  extend(track, group, frameNumber) {
    track.misses = 0;
    track.lastFrame = frameNumber;
    track.oam = group.oam;
    track.centreX = group.centreX;
    track.centreY = group.centreY;

    // A pose has to be rendered while its own frame is current: on a mapper
    // that re-banks CHR, the tiles it refers to are only in place now.
    if (!track.poses.has(group.key)) {
      const rendered = this.analyzer.renderCluster(group.cluster, group.spriteHeight);
      if (!rendered) return;
      track.poses.set(group.key, {
        key: group.key,
        width: rendered.bounds.width,
        height: rendered.bounds.height,
        png: rendered.png
      });
    }

    const current = track.runs[track.runs.length - 1];
    if (current && current.key === group.key) {
      current.frames += 1;
      return;
    }

    track.runs.push({
      key: group.key,
      frames: 1,
      startFrame: frameNumber,
      x: group.x,
      y: group.y,
      oam: group.oam
    });
  }

  /** Step the emulator, following every character it can. */
  track(frameCount = 120, maxGap = 8, minSprites = 2) {
    const open = [];
    const closed = [];

    for (let i = 0; i < frameCount; i++) {
      this.emulator.stepFrame();
      this.assign(open, this.groupsThisFrame(maxGap, minSprites), this.emulator.frameCount);

      for (let t = open.length - 1; t >= 0; t--) {
        if (open[t].misses > this.maxMisses) {
          closed.push(open.splice(t, 1)[0]);
        }
      }
    }

    return this.finish(closed.concat(open));
  }

  /**
   * Drop transients, merge what they were interrupting, and discard tracks that
   * never actually animated.
   */
  finish(tracks) {
    const clips = [];

    for (const track of tracks) {
      const runs = [];
      for (const run of track.runs) {
        if (run.frames < this.minHold) continue;

        // Removing a flicker can leave the same pose either side of it; those
        // are one hold, not two.
        const previous = runs[runs.length - 1];
        if (previous && previous.key === run.key) {
          previous.frames += run.frames;
          continue;
        }
        runs.push({ ...run });
      }

      const keys = [...new Set(runs.map((r) => r.key))];
      if (runs.length < 2 || keys.length < this.minPoses) continue;

      const poses = keys.map((key) => track.poses.get(key)).filter(Boolean);
      if (poses.length < this.minPoses) continue;

      clips.push({
        palette: track.palette,
        firstFrame: track.firstFrame,
        lastFrame: track.lastFrame,
        totalFrames: runs.reduce((sum, r) => sum + r.frames, 0),
        poses,
        timeline: runs.map((run) => ({
          pose: keys.indexOf(run.key),
          frames: run.frames,
          startFrame: run.startFrame,
          x: run.x,
          y: run.y,
          oam: run.oam
        }))
      });
    }

    return clips
      .sort((a, b) => b.totalFrames - a.totalFrames || b.poses.length - a.poses.length)
      .slice(0, this.maxClips)
      .map((clip, id) => ({ id, ...clip }));
  }

  /**
   * Write each clip as a strip plus its timeline.
   *
   * The strip has one cell per entry in the timeline, so a pose that recurs
   * appears once for each time it was held - reading left to right, top to
   * bottom, is reading the animation in order. Cells are uniform and
   * bottom-aligned, so a character's feet stay on one line; where it actually
   * was on screen is recorded in the JSON rather than baked into the image.
   */
  static saveAnimations(clips, outputDir, columns = DEFAULTS.columns) {
    fs.mkdirSync(outputDir, { recursive: true });
    const index = [];

    for (const clip of clips) {
      const clipDir = path.join(outputDir, `clip-${String(clip.id).padStart(3, '0')}`);
      fs.mkdirSync(clipDir, { recursive: true });

      const cells = clip.timeline.map((entry) => clip.poses[entry.pose]);
      const sheet = MetaspriteAnalyzer.saveSheet(cells, path.join(clipDir, 'strip.png'), columns);

      const meta = {
        id: clip.id,
        palette: clip.palette,
        firstFrame: clip.firstFrame,
        lastFrame: clip.lastFrame,
        totalFrames: clip.totalFrames,
        poseCount: clip.poses.length,
        cell: sheet ? { width: sheet.cellWidth, height: sheet.cellHeight } : null,
        columns: sheet ? sheet.columns : columns,
        // Each entry is one cell of strip.png, in reading order.
        timeline: clip.timeline
      };

      fs.writeFileSync(path.join(clipDir, 'animation.json'), JSON.stringify(meta, null, 2));

      index.push({
        id: clip.id,
        directory: path.basename(clipDir),
        palette: clip.palette,
        poseCount: clip.poses.length,
        cells: clip.timeline.length,
        totalFrames: clip.totalFrames
      });
    }

    fs.writeFileSync(path.join(outputDir, 'animations.json'), JSON.stringify(index, null, 2));
    return index;
  }
}

AnimationTracker.DEFAULTS = DEFAULTS;

module.exports = AnimationTracker;
