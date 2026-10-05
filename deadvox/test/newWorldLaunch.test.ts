// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { SaveController } from '../src/ui/saveController.ts';

const BODY_MARKUP = /<body\b[^>]*>([\s\S]*)<\/body>/;
const SCRIPT_MARKUP = /<script\b[^>]*>[\s\S]*?<\/script>/g;

const title = () => {
  const body = readFileSync('index.html', 'utf8').match(BODY_MARKUP)?.[1];
  if (!body) {
    throw new Error('Title fixture needs the actual body markup');
  }
  document.body.innerHTML = body.replace(SCRIPT_MARKUP, '');
  return new SaveController();
};

it('creates and binds only on resource-ready acceptance and enters after controller commitment', async () => {
  const controller = title();
  const actors: Character[] = [];
  const events: string[] = [];
  const bind = vi.spyOn(controller, 'bindSession');
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  await controller.prepare();
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  controller.setNewWorldLauncher(() => {
    expect(controller.isEntered).toBe(false);
    actors.push(new Character(buildRegistry([]).registry));
    events.push('create');
    controller.bindSession(
      () => {
        throw new Error('No checkpoint before entry');
      },
      () => 0,
      { blockSize: 0.5, site: 'forest', storeys: 1, density: 0 },
    );
    events.push('bind');
    return {
      enter: () => {
        expect(controller.isEntered).toBe(true);
        events.push('enter');
      },
    };
  });
  expect(actors).toHaveLength(0);
  document.getElementById('save-replace-confirm')!.click();
  expect(actors).toHaveLength(0);
  document.getElementById('go')!.click();
  expect(events).toEqual(['create', 'bind', 'enter']);
  expect(actors).toHaveLength(1);
  expect(bind).toHaveBeenCalledTimes(1);
  document.getElementById('go')!.click();
  expect(actors).toHaveLength(1);
  expect(bind).toHaveBeenCalledTimes(1);
});

it('does not commit or retry partial initialization after the launch callback fails', async () => {
  const controller = title();
  await controller.prepare();
  let attempts = 0;
  controller.setNewWorldLauncher(() => {
    attempts += 1;
    throw new Error('Fixture initialization failure');
  });
  document.getElementById('go')!.click();
  expect(controller.isEntered).toBe(false);
  document.getElementById('go')!.click();
  expect(attempts).toBe(1);
});
