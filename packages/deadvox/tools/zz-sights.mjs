// biome-ignore-all lint/correctness/noNodejsModules: temporary rob1 wrapper
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const { status } = spawnSync('node', ['test/browser/primary-action-pixel.mjs', 'optic-sights'], { stdio: 'inherit' });
process.exit(status ?? 1);
