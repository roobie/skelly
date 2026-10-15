import { spawn } from 'node:child_process';

const batches = Number(process.env.REPEAT_BATCHES ?? 5);
const width = Number(process.env.REPEAT_WIDTH ?? 4);
const runOnce = () =>
  new Promise((resolve) => {
    const child = spawn('node', ['test/browser/save-controller-regressions.mjs'], { env: process.env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (status) => resolve({ ok: status === 0, out }));
  });
let failures = 0;
let total = 0;
for (let b = 1; b <= batches; b += 1) {
  const results = await Promise.all(Array.from({ length: width }, runOnce));
  results.forEach((r, i) => {
    total += 1;
    if (r.ok) {
      process.stdout.write(`batch ${b} run ${i} ok\n`);
    } else {
      failures += 1;
      process.stdout.write(`--- batch ${b} run ${i} FAILED\n${r.out.slice(-6000)}\n`);
    }
  });
}
process.stdout.write(`runs=${total} failures=${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
