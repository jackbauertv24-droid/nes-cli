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
