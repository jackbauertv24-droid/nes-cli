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
  // A fast NES character covers a few pixels per frame; 24 is generous. The
  // allowance grows while a character is missing, since it keeps moving.
  maxMove: 24,
  // How many frames a character may be absent before its clip is closed.
  // Games drop sprites when too many share a scanline, and Castlevania's demo
  // loses Simon for six to twelve frames at a time, so this has to be forgiving
  // enough to ride that out without stitching two different characters together.
  maxMisses: 12,
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
 * Identity is decided by three signals, none of which can be trusted alone.
 *
 * Overlapping OAM slots are strong evidence where they exist, because many
 * games keep a character in the same slots for as long as it lives - Luigi held
 * slots 10, 11, 13 and 14 for fifty frames of SMB3's title demo. But plenty of
 * games rotate slots every frame to spread sprite flicker evenly, and
 * Castlevania is one: Simon's slots run [19,23,38,53] then [17,21,36,51,55]
 * then [20,24,31,35,...] on consecutive frames, so overlap there is zero.
 *
 * Palette is a good hint but a bad rule. A character's dominant palette changes
 * when its cluster composition does - Simon is palette 0, his whip is palette 1,
 * and when the whip is out the combined cluster's majority flips. Treating
 * palette as a veto loses the character every time he attacks.
 *
 * So position is the gate and the other two are preferences: a candidate has to
 * be within reach, and among those that are, shared slots and a matching
 * palette decide which is which. The reach grows while a character is missing,
 * because it does not stop moving just because it stopped being drawn.
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
    const overlap = group.oam.filter((id) => track.oam.includes(id)).length;
    const distance = Math.hypot(group.centreX - track.centreX, group.centreY - track.centreY);

    // A character absent for several frames has had several frames in which to
    // move, so the allowance grows with the gap.
    const reach = this.maxMove * (track.misses + 1);

    // Shared slots override the distance gate: a character that jumps across
    // the screen but keeps its slots is still that character.
    if (overlap === 0 && distance > reach) {
      return null;
    }

    return { overlap, distance, samePalette: track.palette === group.palette };
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

    // Same-palette pairs are claimed first, so two adjacent characters of
    // different colours settle onto the right tracks before anything else is
    // allowed to match on position alone.
    pairs.sort(
      (a, b) =>
        Number(b.samePalette) - Number(a.samePalette) ||
        b.overlap - a.overlap ||
        a.distance - b.distance
    );

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
      paletteTally: new Map(),
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

    // Report the palette the character wore for most of its life, rather than
    // whatever it happened to be showing on the frame it was first seen.
    track.paletteTally.set(group.palette, (track.paletteTally.get(group.palette) || 0) + 1);
    track.palette = [...track.paletteTally.entries()].sort((a, b) => b[1] - a[1])[0][0];

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
  track(frameCount = 120, maxGap = 0, minSprites = 2) {
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
