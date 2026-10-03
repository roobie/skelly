import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Body } from '../src/core/physics.ts';
import { makeConfig } from '../src/game/config.ts';
import type { Engine } from '../src/game/engine.ts';
import { createPlayView } from '../src/render/playView.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown,
    })),
);

const fixture = () => {
  const inventory = new Inventory({ ...registry, models: new Map() });
  const page = new EventTarget();
  const renderer = { toneMapping: 0, toneMappingExposure: 1 };
  const mood = { restore: vi.fn(), render: vi.fn((draw: () => void) => draw()) };
  const shadows = { restore: vi.fn(), attachTorch: vi.fn(), warmUp: vi.fn(() => Promise.resolve()) };
  const engine = {
    config: { ...makeConfig(73, 64, 0.5), actors: 'boxes' },
    registry: inventory.registry,
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    meshes: { setLinearColors: vi.fn(), setPatterns: vi.fn(), setOcclusion: vi.fn() },
    mood,
    shadows,
    sky: {},
    isSolid: () => false,
  } as unknown as Engine;
  const view = createPlayView(engine, inventory, vi.fn(), page);
  return { engine, view, page, mood, shadows };
};

describe('play presentation ownership', () => {
  it('routes world and held drawing through mood and warms both render targets', async () => {
    const { engine, view, mood, shadows } = fixture();
    const draw = vi.spyOn(view.held, 'render').mockImplementation(() => undefined);
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(20).mockReturnValueOnce(25);
    expect(view.render()).toBe(5);
    clock.mockRestore();
    expect(mood.render).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledExactlyOnceWith(engine.renderer, engine.camera, engine.sky);
    await view.warmUp();
    expect(shadows.warmUp).toHaveBeenCalledExactlyOnceWith(engine.mood, [
      { scene: engine.scene, camera: engine.camera },
      view.held.warmUpTarget,
    ]);
    view.dispose();
  });

  it('releases owned pile and case instances on pagehide', () => {
    const { page, view } = fixture();
    const piles = vi.spyOn(view.piles, 'dispose');
    const cases = vi.spyOn(view.caseEffects, 'dispose');
    expect(piles).not.toHaveBeenCalled();
    expect(cases).not.toHaveBeenCalled();
    page.dispatchEvent(new Event('pagehide'));
    expect(piles).toHaveBeenCalledTimes(1);
    expect(cases).toHaveBeenCalledTimes(1);
  });

  it('projects block-space camera/player state without advancing the body', () => {
    const { engine, view } = fixture();
    const body: Body = { pos: [2, 1, 6], vel: [0, 0, 0], halfWidth: 0.6, height: 3.6, onGround: true };
    const before = structuredClone(body);
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    view.updateCamera({ dt: 0.1, body, paused: false, noclip: false, yaw: 0, pitch: 0, eye: [2, 4.24, 6] }, damage);
    expect(engine.camera.position.toArray()).toEqual([1, 2.12, 3]);
    expect(body).toEqual(before);
    expect(damage.style.opacity).toBe('0');
    view.dispose();
  });
});
