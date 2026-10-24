import { afterEach, describe, expect, it, vi } from 'vitest';
import content from '../src/mob/attackClips.json' with { type: 'json' };

describe('content-authored attack clips', () => {
  afterEach(() => {
    vi.doUnmock('../src/mob/attackClips.json');
    vi.resetModules();
  });

  it('makes a clip added to the content selectable with no code change', async () => {
    const fixtureId = 'fixture-clip';
    const fixture = { ...structuredClone(content.swipe), name: fixtureId };
    vi.resetModules();
    vi.doMock('../src/mob/attackClips.json', () => ({ default: { ...content, [fixtureId]: fixture } }));
    const { ATTACK_CLIPS, attackClipById, attackClipFor } = await import('../src/mob/attack.ts');

    expect(Object.keys(ATTACK_CLIPS)).toContain(fixtureId);
    expect(attackClipById(fixtureId)?.name).toBe(fixtureId);
    expect(attackClipFor({ name: 'fixture-template', attackClip: fixtureId }).name).toBe(fixtureId);
  });

  it('refuses content whose entry name differs from its id', async () => {
    vi.resetModules();
    vi.doMock('../src/mob/attackClips.json', () => ({ default: { ...content, misnamed: content.swipe } }));
    await expect(import('../src/mob/attack.ts')).rejects.toThrow('attack clip "misnamed"');
  });
});
