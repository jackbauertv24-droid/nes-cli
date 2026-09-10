const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { boot, tmpdir } = require('./helpers');
const AnimationTracker = require('../src/formats/image/animation');
const SpritesCommand = require('../src/commands/sprites');

/**
 * animation.nes walks a 16x32 character to the right, cycling three poses every
 * eight frames. Its four sprites stay in OAM slots 0-3, so both identity
 * signals - slot overlap and position - point the same way.
 */
describe('animation tracking', () => {
  test('the character is followed as a single clip', () => {
    const emulator = boot('animation.nes', 20);
    const clips = new AnimationTracker(emulator).track(96);

    expect(clips).toHaveLength(1);
    expect(clips[0].poses).toHaveLength(3);
    expect(clips[0].palette).toBe(1);
  });

  test('the timeline is in order, and records how long each pose was held', () => {
    const emulator = boot('animation.nes', 20);
    const [clip] = new AnimationTracker(emulator).track(96);

    // Poses advance every eight frames and cycle, so consecutive entries are
    // always different and the sequence repeats.
    for (let i = 1; i < clip.timeline.length; i++) {
      expect(clip.timeline[i].pose).not.toBe(clip.timeline[i - 1].pose);
    }

    const held = clip.timeline.slice(1, -1).map((t) => t.frames);
    for (const frames of held) {
      expect(frames).toBe(8);
    }

    // Start frames increase monotonically: this is a timeline, not a bag.
    const starts = clip.timeline.map((t) => t.startFrame);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  test('movement across the screen is recorded', () => {
    const emulator = boot('animation.nes', 20);
    const [clip] = new AnimationTracker(emulator).track(96);

    const xs = clip.timeline.map((t) => t.x);
    expect(xs[xs.length - 1]).toBeGreaterThan(xs[0]);
    // One pixel every other frame, so roughly half the frame count.
    expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan(20);
  });

  test('a character that never changes pose is not an animation', () => {
    // metasprite.nes holds one pose forever; there is nothing to animate.
    const emulator = boot('metasprite.nes', 20);
    expect(new AnimationTracker(emulator).track(60)).toHaveLength(0);
  });

  test('minPoses can be relaxed to accept a static character', () => {
    const emulator = boot('metasprite.nes', 20);
    const clips = new AnimationTracker(emulator, { minPoses: 1 }).track(60);
    // Still nothing: a single unchanging run is one timeline entry, and a clip
    // needs at least two to be a sequence.
    expect(clips).toHaveLength(0);
  });

  test('minHold discards poses that were not held long enough', () => {
    const emulator = boot('animation.nes', 20);
    const tracker = new AnimationTracker(emulator);

    // Every pose here is held for 8 frames, so a high threshold removes them
    // all and leaves no clip - which is the mechanism the default relies on to
    // discard single-frame flicker.
    const strict = new AnimationTracker(emulator, { minHold: 20 });
    expect(strict.track(96)).toHaveLength(0);

    expect(tracker.track(96)[0].timeline.length).toBeGreaterThan(4);
  });

  describe('written files', () => {
    let outDir;
    let meta;

    beforeAll(() => {
      const emulator = boot('animation.nes', 20);
      outDir = tmpdir('animation');
      new SpritesCommand(emulator).execute({
        format: 'animation',
        outputDir: outDir,
        frames: 96
      });
      meta = JSON.parse(
        fs.readFileSync(path.join(outDir, 'animations', 'clip-000', 'animation.json'), 'utf8')
      );
    });

    test('animation.json describes the timeline', () => {
      expect(meta).toMatchObject({ id: 0, palette: 1, poseCount: 3 });
      expect(meta.cell).toEqual({ width: 16, height: 32 });
      expect(meta.timeline.length).toBeGreaterThan(4);
      expect(meta.timeline[0]).toHaveProperty('frames');
      expect(meta.timeline[0]).toHaveProperty('startFrame');
      expect(meta.timeline[0].oam).toEqual([0, 1, 2, 3]);
    });

    test('the strip has one cell per timeline entry', () => {
      const png = PNG.sync.read(
        fs.readFileSync(path.join(outDir, 'animations', 'clip-000', 'strip.png'))
      );
      const columns = Math.min(meta.columns, meta.timeline.length);
      const rows = Math.ceil(meta.timeline.length / columns);

      expect(png.width).toBe(columns * meta.cell.width);
      expect(png.height).toBe(rows * meta.cell.height);
    });

    test('cells keep the transparency of the poses', () => {
      const png = PNG.sync.read(
        fs.readFileSync(path.join(outDir, 'animations', 'clip-000', 'strip.png'))
      );
      // The fixture's tiles have transparent corners.
      expect(png.data[3]).toBe(0);
      expect(png.data[(4 * png.width + 4) * 4 + 3]).toBe(255);
    });

    test('animations.json indexes the clips', () => {
      const index = JSON.parse(
        fs.readFileSync(path.join(outDir, 'animations', 'animations.json'), 'utf8')
      );
      expect(index).toHaveLength(1);
      expect(index[0]).toMatchObject({ id: 0, directory: 'clip-000', palette: 1 });
    });
  });

  test('the command reports when nothing animated', () => {
    const emulator = boot('metasprite.nes', 20);
    const result = new SpritesCommand(emulator).execute({
      format: 'animation',
      outputDir: tmpdir('animation-empty'),
      frames: 60
    });
    expect(result).toBeNull();
  });
});

/**
 * flicker.nes rotates its character through a different block of OAM slots
 * every frame and skips drawing it entirely for four frames out of thirty-two.
 * Both behaviours are copied from Castlevania, whose demo rotates slots every
 * frame and loses Simon for six to twelve frames at a time.
 */
describe('characters that flicker and move around OAM', () => {
  const SpriteHandler = require('../src/formats/image/spritesheet');

  test('the fixture shares no OAM slot between consecutive frames', () => {
    const emulator = boot('flicker.nes', 30);
    const drawn = [];

    for (let i = 0; i < 40; i++) {
      emulator.run(1);
      const visible = SpriteHandler.extractOAM(emulator).filter((s) => s.visible);
      if (visible.length) drawn.push(visible.map((s) => s.id));
    }

    for (let i = 1; i < drawn.length; i++) {
      const shared = drawn[i].filter((id) => drawn[i - 1].includes(id));
      expect(shared).toHaveLength(0);
    }
  });

  test('the fixture stops drawing the character periodically', () => {
    const emulator = boot('flicker.nes', 30);
    let blank = 0;

    for (let i = 0; i < 64; i++) {
      emulator.run(1);
      if (SpriteHandler.extractOAM(emulator).filter((s) => s.visible).length === 0) blank += 1;
    }

    expect(blank).toBeGreaterThan(4);
  });

  test('it is still tracked as one clip', () => {
    // Identity here can only come from position: slots never overlap, so a
    // tracker that leans on them produces a new clip every frame.
    const emulator = boot('flicker.nes', 30);
    const clips = new AnimationTracker(emulator).track(160);

    expect(clips).toHaveLength(1);
    expect(clips[0].poses).toHaveLength(3);
    expect(clips[0].totalFrames).toBeGreaterThan(100);
  });

  test('too strict a miss allowance breaks the clip up', () => {
    // Demonstrates why the default is forgiving: with almost no tolerance for
    // absence, the blank frames shatter one character into many clips.
    const emulator = boot('flicker.nes', 30);
    const clips = new AnimationTracker(emulator, { maxMisses: 0 }).track(160);
    expect(clips.length).toBeGreaterThan(1);
  });
});

describe('identity matching', () => {
  function tracker(options) {
    return new AnimationTracker(boot('animation.nes', 10), options);
  }

  const track = (overrides = {}) => ({
    palette: 0,
    oam: [0, 1, 2, 3],
    centreX: 100,
    centreY: 100,
    misses: 0,
    ...overrides
  });

  const group = (overrides = {}) => ({
    palette: 0,
    oam: [0, 1, 2, 3],
    centreX: 100,
    centreY: 100,
    ...overrides
  });

  test('a nearby candidate matches even when its palette differs', () => {
    // A character's dominant palette changes with its cluster: Simon is
    // palette 0 and his whip palette 1, so the combined cluster flips when he
    // attacks. Treating palette as a veto loses him on every swing.
    const score = tracker().matchScore(track(), group({ palette: 1, oam: [40, 41] }));
    expect(score).not.toBeNull();
    expect(score.samePalette).toBe(false);
  });

  test('a matching palette is preferred over a merely closer candidate', () => {
    const t = tracker();
    const same = t.matchScore(track(), group({ oam: [40], centreX: 120 }));
    const different = t.matchScore(track(), group({ palette: 2, oam: [40], centreX: 101 }));

    expect(same.samePalette).toBe(true);
    expect(different.samePalette).toBe(false);
    expect(different.distance).toBeLessThan(same.distance);
    // assign() sorts on samePalette first, so the further same-palette
    // candidate wins despite being further away.
  });

  test('shared OAM slots override the distance limit', () => {
    const far = group({ centreX: 240, oam: [0, 1] });
    expect(tracker().matchScore(track(), far)).not.toBeNull();
  });

  test('a distant candidate with no shared slots is rejected', () => {
    const far = group({ centreX: 240, oam: [40, 41] });
    expect(tracker().matchScore(track(), far)).toBeNull();
  });

  test('the reach grows while a character is missing', () => {
    const t = tracker();
    const far = group({ centreX: 160, oam: [40, 41] });

    expect(t.matchScore(track({ misses: 0 }), far)).toBeNull();
    // Absent for three frames, so it has had three frames in which to move.
    expect(t.matchScore(track({ misses: 3 }), far)).not.toBeNull();
  });
});
