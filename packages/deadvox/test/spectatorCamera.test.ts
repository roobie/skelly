import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE, type SessionControls } from '../src/game/session.ts';
import { SpectatorCamera } from '../src/game/spectatorCamera.ts';
import { startupContent } from './baseRegistry.ts';

const { registry } = startupContent();
const scale = makeScale(0.5);
const FRAME = 1 / 60;
const FRAMES = 120;
const isSolid = (_x: number, y: number): boolean => y === 0;

/** Every avatar-bound input a player can send, held down at once. */
const hostileControls = () => {
  const useDominant = vi.fn();
  const useOff = vi.fn();
  let crouchPressed = true;
  const controls: SessionControls = {
    active: () => true,
    intent: () => ({
      forward: 1,
      right: 1,
      jump: true,
      sprint: true,
      walk: false,
      useDominant: true,
      useDominantHeld: true,
      useOff: true,
    }),
    consumeCrouchToggle: () => {
      const pending = crouchPressed;
      crouchPressed = false;
      return pending;
    },
    useDominant,
    useOff,
    readyHeld: () => true,
    blocking: () => true,
    automaticFireHeld: () => true,
    yaw: () => 0.4,
    pitch: () => 0.1,
    walking: () => false,
    descending: () => true,
  };
  return { controls, useDominant, useOff };
};

const idleControls = (): SessionControls => ({
  active: () => true,
  intent: () => IDLE,
  yaw: () => 0.4,
  pitch: () => 0.1,
  walking: () => false,
  descending: () => false,
});

const runtime = (controls: SessionControls) => {
  const session = createSession({
    registry,
    world: new World(),
    scale,
    seed: 5,
    start: 43_200,
    spawn: [0.5, 1, 0.5],
    isSolid,
    isOpaque: isSolid,
    ready: () => true,
    controls,
    audio: { play: () => undefined },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
  });
  session.sim.paused = false;
  const frames = (): void => {
    for (let frame = 0; frame < FRAMES; frame++) {
      session.frame(FRAME);
    }
  };
  return { session, frames };
};

const observed = (session: ReturnType<typeof runtime>['session']) => ({
  pos: [...session.body.pos],
  time: session.sim.time,
  eyeHeight: session.playerEyeHeightMetres,
});

const eyeOf = (session: ReturnType<typeof runtime>['session']): Vec3 => [
  session.body.pos[0],
  session.body.pos[1] + session.playerEyeHeightMetres / scale.blockSize,
  session.body.pos[2],
];

describe('spectator camera', () => {
  it('leaves the avatar and the world tick as they would be without it, whatever input arrives while detached', () => {
    const reference = runtime(idleControls());
    reference.frames();

    const spectator = new SpectatorCamera();
    const hostile = hostileControls();
    const detached = runtime(spectator.guard(hostile.controls));
    spectator.toggle(detached.session.body, eyeOf(detached.session), 0.4, 0.1);
    detached.frames();

    expect(observed(detached.session)).toEqual(observed(reference.session));
    expect(hostile.useDominant).not.toHaveBeenCalled();
    expect(hostile.useOff).not.toHaveBeenCalled();
  });

  it('lets the same input act on the avatar once the camera returns to it', () => {
    const reference = runtime(idleControls());
    reference.frames();
    const spectator = new SpectatorCamera();
    const attached = runtime(spectator.guard(hostileControls().controls));
    attached.frames();
    expect(observed(attached.session).pos).not.toEqual(observed(reference.session).pos);
  });

  it('refuses avatar commands while detached but keeps debug and menu commands', () => {
    const spectator = new SpectatorCamera();
    const { session } = runtime(idleControls());
    expect(spectator.allowsCommand('quickbar.use.1')).toBe(true);
    spectator.toggle(session.body, eyeOf(session), 0, 0);
    expect(spectator.allowsCommand('quickbar.use.1')).toBe(false);
    expect(spectator.allowsCommand('ui.inventory-toggle')).toBe(false);
    expect(spectator.allowsCommand('debug.spectator-camera-toggle')).toBe(true);
    expect(spectator.allowsCommand('ui.main-menu-toggle')).toBe(true);
  });

  it('teleports the avatar under the camera, and refuses a spot inside solid ground', () => {
    const spectator = new SpectatorCamera();
    const { session } = runtime(idleControls());
    const eyeHeight = session.playerEyeHeightMetres / scale.blockSize;
    expect(spectator.teleport(session.body, eyeHeight, isSolid)).toBeUndefined();

    spectator.toggle(session.body, eyeOf(session), 0, 0);
    spectator.body!.pos = [12.5, 6, -3.5];
    expect(spectator.teleport(session.body, eyeHeight, isSolid)).toBe('moved');
    expect([...session.body.pos]).toEqual([12.5, 6 - eyeHeight, -3.5]);

    const before = [...session.body.pos];
    spectator.body!.pos = [2.5, 0.5 + eyeHeight, 2.5];
    expect(spectator.teleport(session.body, eyeHeight, isSolid)).toBe('blocked');
    expect([...session.body.pos]).toEqual(before);
  });
});
