import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const [, , out] = process.argv;
if (!out) {
  throw new Error('Usage: node deadvox/tools/acid-glow-spike-config.mjs OUTPUT.json');
}
const config = JSON.parse(await readFile(new URL('../src/config/perf-baseline.json', import.meta.url), 'utf8'));
const horde = config.routes.find((route) => route.id === 'gauntlet-horde');
const routes = [];
for (const count of [1, horde.spawnCount]) {
  for (const post of [0, 1]) {
    for (const option of ['baseline', 'b', 'a', 'c']) {
      for (const share of option === 'baseline' || count === 1 ? [1] : [0.1, 1]) {
        routes.push({
          ...horde,
          cpuProfile: false,
          spawnCount: count,
          freezeGame: true,
          yawAmplitudeDegrees: 15,
          id: `n${count}-post${post}-${option}-share${share}-windup`,
          path: `${horde.path}&cam=18,60,14,-90,-25,0&renderscale=0.5&post=${post}&bloom=${post}&acidGlow=${option}&acidShare=${share}&acidAnimate=1&acidCount=${count}`,
        });
      }
    }
  }
  for (const option of ['b', 'a', 'c']) {
    routes.push({
      ...horde,
      cpuProfile: false,
      spawnCount: count,
      freezeGame: true,
      yawAmplitudeDegrees: 15,
      id: `n${count}-post0-${option}-share1-static`,
      path: `${horde.path}&cam=18,60,14,-90,-25,0&renderscale=0.5&post=0&bloom=0&acidGlow=${option}&acidShare=1&acidAnimate=0&acidCount=${count}`,
    });
  }
  for (const share of count === 1 ? [1] : [0.1, 1]) {
    routes.push({
      ...horde,
      cpuProfile: false,
      spawnCount: count,
      freezeGame: true,
      yawAmplitudeDegrees: 15,
      id: `n${count}-post0-a-pool-share${share}-windup`,
      path: `${horde.path}&cam=18,60,14,-90,-25,0&renderscale=0.5&post=0&bloom=0&acidGlow=a-pool&acidShare=${share}&acidAnimate=1&acidCount=${count}`,
    });
  }
}
await writeFile(out, JSON.stringify({ ...config, modes: ['whole'], routes }, null, 2));
