// @vitest-environment happy-dom

import { afterEach, expect, it } from 'vitest';
import { createSkyRoutePanel } from '../src/ui/skyRoutePanel.ts';

afterEach(() => {
  document.body.replaceChildren();
});

it('publishes completion only after the route evidence is available to an observer', async () => {
  const root = document.createElement('div');
  root.id = 'sky-route-root';
  document.body.append(root);
  const panel = createSkyRoutePanel('https://example.invalid/');
  const section = root.querySelector<HTMLElement>('[data-sky-route]')!;
  expect(section.dataset.state).toBe('pending');
  panel.started();
  panel.progress('fixture progress');
  expect(section.dataset.state).toBe('pending');
  const evidence = new Promise<string>((resolve) => {
    const observer = new MutationObserver(() => {
      if (section.dataset.state === 'complete') {
        observer.disconnect();
        resolve(section.querySelector('textarea')!.value);
      }
    });
    observer.observe(section, { attributes: true, attributeFilter: ['data-state'] });
  });
  panel.complete('fixture summary', '{"fixture":true}');
  expect(section.dataset.state).toBe('complete');
  expect(await evidence).toBe('{"fixture":true}');
});
