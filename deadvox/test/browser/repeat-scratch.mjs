import { spawnSync } from 'node:child_process';

const runs = Number(process.env.REPEAT_RUNS ?? 20);
let failures = 0;
for (let i = 1; i <= runs; i += 1) {
  const result = spawnSync('node', ['test/browser/save-controller-regressions.mjs'], {
    encoding: 'utf8',
    env: process.env,
  });
  const ok = result.status === 0;
  if (!ok) {
    failures += 1;
    process.stdout.write(`--- run ${i} FAILED\n${(result.stdout + result.stderr).slice(-6000)}\n`);
    break;
  } else {
    process.stdout.write(`run ${i} ok\n`);
  }
}
process.stdout.write(`runs=${runs} failures=${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
