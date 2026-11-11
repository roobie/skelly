import { spawnSync } from 'node:child_process';

const runs = Number(process.argv[2] ?? 20);
let failures = 0;
for (let run = 1; run <= runs; run++) {
  const result = spawnSync('node', ['test/browser/reading.mjs', process.argv[3] ?? 'consumer'], {
    encoding: 'utf8',
    timeout: 120000,
  });
  const out = `${result.stdout}${result.stderr}`;
  const hit = out.split('\n').find((line) => line.includes('too dark at midnight'));
  console.log(`run ${run}: exit ${result.status}`);
  if (result.status !== 0) {
    failures++;
    console.log(hit ?? out.slice(-1500));
  }
}
console.log(`failures ${failures}/${runs}`);
