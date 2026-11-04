import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const agentModule = /['"][^'"\n]*\/agent[^/'"\n]*['"]/g;

it('body and shared leaves reference no agent module, including type-only imports', () => {
  const leaves = ['actorState', 'actorMotion', 'actorPose', 'actorRegions', 'actorSense', 'actorTickScratch'];
  const violations: string[] = [];
  for (const name of leaves) {
    const path = new URL(`../src/core/${name}.ts`, import.meta.url);
    for (const match of readFileSync(path, 'utf8').matchAll(agentModule)) {
      violations.push(`${name}: ${match[0]}`);
    }
  }
  expect(violations).toEqual([]);
});
