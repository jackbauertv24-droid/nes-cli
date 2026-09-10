const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fixture, tmpdir } = require('./helpers');

const CLI = path.join(__dirname, '..', 'bin', 'nes-cli.js');

function run(args, cwd) {
  return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

describe('command line', () => {
  test('load then run in separate processes keeps the session', () => {
    // This is the workflow the README documented and which could not work:
    // emulator state lived in a module-level variable, so the second process
    // always reported "No ROM loaded".
    const cwd = tmpdir('session');

    run(['load', fixture('solid.nes')], cwd);
    expect(fs.existsSync(path.join(cwd, '.nes-cli-session.json'))).toBe(true);

    const output = run(['run', '30'], cwd);
    expect(output).toMatch(/Completed 30 frames/);

    run(['screenshot', 'shot.png'], cwd);
    expect(fs.existsSync(path.join(cwd, 'shot.png'))).toBe(true);
  });

  test('a command without a session explains what to do', () => {
    const cwd = tmpdir('nosession');
    expect(() => run(['run', '10'], cwd)).toThrow();

    try {
      run(['run', '10'], cwd);
    } catch (error) {
      expect(error.stderr).toMatch(/No session found/);
      expect(error.stderr).toMatch(/nes-cli load/);
    }
  });

  test('script can screenshot immediately after loading', () => {
    // Loading now renders one frame, so there is always a framebuffer; this
    // used to fail with "No frame captured yet".
    const cwd = tmpdir('script');
    const output = run(['script', fixture('solid.nes'), 'screenshot:first.png'], cwd);

    expect(output).not.toMatch(/No frame captured/);
    expect(fs.existsSync(path.join(cwd, 'first.png'))).toBe(true);
  });

  test('script runs a sequence of commands in one process', () => {
    const cwd = tmpdir('script-seq');
    const output = run(
      ['script', fixture('input.nes'), 'run:30', 'input:START', 'run:10', 'screenshot:out.png'],
      cwd
    );

    expect(output).toMatch(/Pressed START/);
    expect(fs.existsSync(path.join(cwd, 'out.png'))).toBe(true);
  });

  test('an unknown button fails loudly and exits non-zero', () => {
    const cwd = tmpdir('badbutton');
    run(['load', fixture('input.nes')], cwd);

    expect(() => run(['input', 'TURBO'], cwd)).toThrow();

    try {
      run(['input', 'TURBO'], cwd);
    } catch (error) {
      expect(error.status).not.toBe(0);
      expect(error.stderr).toMatch(/Unknown button "TURBO"/);
      expect(error.stderr).toMatch(/A, B, SELECT, START/);
    }
  });
});

describe('session fidelity', () => {
  const { PNG } = require('pngjs');

  test('a screenshot after a restore shows the game, not the power-on frame', () => {
    // jsnes state does not include the rendered screen, so a restore used to
    // leave the framebuffer showing the blank frame drawn at load time.
    const cwd = tmpdir('fidelity');

    run(['load', fixture('sprites.nes'), '--frames', '60'], cwd);
    run(['screenshot', 'restored.png'], cwd);

    run(['script', fixture('sprites.nes'), 'run:60', 'screenshot:direct.png'], cwd);

    const restored = PNG.sync.read(fs.readFileSync(path.join(cwd, 'restored.png')));
    const direct = PNG.sync.read(fs.readFileSync(path.join(cwd, 'direct.png')));

    expect(Buffer.compare(restored.data, direct.data)).toBe(0);
    // And it is a real screen, not one flat colour.
    const colours = new Set();
    for (let i = 0; i < restored.width * restored.height; i++) {
      colours.add(restored.data.readUInt32BE(i * 4));
    }
    expect(colours.size).toBeGreaterThan(1);
  });
});
