import { spawnSync } from 'node:child_process';

const runs = Number(process.argv[2] ?? 20);
const say = (text) => process.stdout.write(`${text}\n`);
let failures = 0;
for (let run = 1; run <= runs; run += 1) {
  const result = spawnSync('node', ['test/browser/reading.mjs', process.argv[3] ?? 'consumer'], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  const out = `${result.stdout}${result.stderr}`;
  const hit = out.split('\n').find((line) => line.includes('too dark at midnight'));
  say(`run ${run}: exit ${result.status}`);
  if (result.status !== 0) {
    failures += 1;
    say(hit ?? out.slice(-1500));
  }
}
say(`failures ${failures}/${runs}`);
