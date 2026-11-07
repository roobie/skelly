import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const agentModule = /['"][^'"\n]*\/agent[^/'"\n]*['"]/g;
const leaves = [
  'actorState',
  'actorMotion',
  'actorPose',
  'actorRegions',
  'actorSense',
  'actorTickScratch',
  'actorModels',
];
const core = new URL('../src/core/', import.meta.url);
const agents = [
  ...new Set([
    'agent',
    'agentHorde',
    'agentPerception',
    'agentSave',
    ...readdirSync(core)
      .filter((name) => name.startsWith('agent') && name.endsWith('.ts'))
      .map((name) => name.slice(0, -3)),
  ]),
];

it('body and shared leaves reference no agent module, including type-only imports', () => {
  const violations: string[] = [];
  for (const name of leaves) {
    const path = new URL(`../src/core/${name}.ts`, import.meta.url);
    for (const match of readFileSync(path, 'utf8').matchAll(agentModule)) {
      violations.push(`${name}: ${match[0]}`);
    }
  }
  expect(violations).toEqual([]);
});

it.each([
  ['model', /\.\s*model\w*/g],
  ['figure', /\.\s*figure\w*/g],
  ['@mobgen', /['"]@mobgen[^'"\n]*['"]/g],
] as const)('agent modules reference no %s anatomy', (_rule, pattern) => {
  const violations: string[] = [];
  for (const name of agents) {
    for (const match of readFileSync(new URL(`${name}.ts`, core), 'utf8').matchAll(pattern)) {
      violations.push(`${name}: ${match[0]}`);
    }
  }
  expect(violations).toEqual([]);
});

it('body and shared leaves read no agent state', () => {
  const violations: string[] = [];
  for (const name of leaves) {
    for (const match of readFileSync(new URL(`${name}.ts`, core), 'utf8').matchAll(/\.\s*agent\b/g)) {
      violations.push(`${name}: ${match[0]}`);
    }
  }
  expect(violations).toEqual([]);
});
