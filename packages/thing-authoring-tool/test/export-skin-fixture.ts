import { resolve } from 'node:path';
import { writeRecipeExports } from '@skelly/thing-export/files.ts';
import { loadCatalogue } from '../src/catalogue.ts';
import { exportItem } from '../src/exports.ts';
import fixture from './fixtures/bend-strip.json' with { type: 'json' };

const item = loadCatalogue(fixture).items[0]!;
const asset = { id: item.id, file: `assets/models/${item.id}.glb` as const };
const voxel = { voxelGrain: item.voxelGrain! };
writeRecipeExports(
  [{ id: item.id, kind: 'item', source: item.id, voxel, generate: () => exportItem(item, asset, voxel) }],
  resolve(import.meta.dirname, '../../deadvox/test/fixtures/skin'),
  'things',
);
