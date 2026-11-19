import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { housingReaches, screenFiles } from '../packages/presentation/tools/work-site-boundary.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The cases' modules exist only in the overlay, beside no real file.
const CASES = join(ROOT, 'test/work-site-boundary');
const SCREEN = 'test/work-site-boundary/screen.ts';
const screen = join(ROOT, SCREEN);

test('an optional housing type re-exported through a barrel reaches the screen', () => {
  const overlay = new Map([
    [
      join(CASES, 'declare.ts'),
      "import type { FurnitureDef } from '@skelly/engine/content';\nexport type Optional = FurnitureDef | undefined;\n",
    ],
    [join(CASES, 'barrel.ts'), "export type { Optional } from './declare.ts';\n"],
    [screen, "import type { Optional } from './barrel.ts';\n"],
  ]);
  assert.deepEqual(housingReaches([screen], overlay), [
    { file: SCREEN, line: 1, name: 'Optional', housing: 'packages/engine/src/core/schema/furniture.ts' },
  ]);
});

test('the craft readout is checked as part of the screen', () => {
  const readout = 'packages/presentation/src/ui/craftReadout.ts';
  const housing = '../../../engine/src/core/housing.ts';
  const source = join(ROOT, readout);
  const overlay = new Map([[source, `export type {} from '${housing}';\n${readFileSync(source, 'utf8')}`]]);
  assert.deepEqual(housingReaches(screenFiles, overlay), [
    { file: readout, line: 1, name: housing, housing: 'packages/engine/src/core/housing.ts' },
  ]);
});

test('only the Start command stays opaque among unions holding a part service request', () => {
  const overlay = new Map([
    [
      join(CASES, 'request.ts'),
      "import type { PartServiceRequest } from '@skelly/engine/inventory';\nexport type Request = { kind: 'other' } | PartServiceRequest;\n",
    ],
    [
      screen,
      "import type { ReplayActionPayload } from '@skelly/engine/input';\nimport type { Request } from './request.ts';\n",
    ],
  ]);
  assert.deepEqual(housingReaches([screen], overlay), [
    { file: SCREEN, line: 2, name: 'Request', housing: 'packages/engine/src/core/partService.ts' },
  ]);
});
