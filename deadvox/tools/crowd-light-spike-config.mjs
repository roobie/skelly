import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const [, , out] = process.argv;
if (!out) {
  throw new Error('Usage: node deadvox/tools/crowd-light-spike-config.mjs OUTPUT.json');
}
const config = JSON.parse(await readFile(new URL('../src/config/perf-baseline.json', import.meta.url), 'utf8'));
const horde = config.routes.find((route) => route.id === 'gauntlet-horde');
const routes = [];
function add({ count, option, share = 1, animate = true, radius = 0, post = 0 }) {
  const enabled = option === 'c' || option === 'empty';
  const glow = option === 'baseline' ? 'baseline' : 'a';
  routes.push({
    ...horde,
    cpuProfile: false,
    spawnCount: Math.min(count, 100),
    freezeGame: true,
    yawAmplitudeDegrees: 15,
    id: `crowd-n${count}-post${post}-${option}-r${radius}-share${share}-${animate ? 'windup' : 'static'}`,
    path: `${horde.path}&cam=18,60,14,-90,-25,0&renderscale=0.5&post=${post}&bloom=${post}&acidGlow=${glow}&acidShare=${share}&acidAnimate=${Number(animate)}&acidCount=${count}&acidLightGrid=${Number(enabled)}&acidLightRadius=${radius || 4}`,
  });
}
for (const count of [1, 40, 100]) {
  add({ count, option: 'baseline' });
  for (const share of count === 1 ? [1] : [0.1, 1]) {
    for (const animate of [false, true]) {
      add({ count, option: 'a', share, animate });
      for (const radius of [2, 4]) {
        add({ count, option: 'c', share, animate, radius });
      }
    }
  }
}
add({ count: 40, option: 'a', share: 0 });
for (const radius of [2, 4]) {
  add({ count: 40, option: 'empty', share: 0, radius });
}
add({ count: 40, option: 'baseline', post: 1 });
add({ count: 40, option: 'a', post: 1 });
for (const radius of [2, 4]) {
  add({ count: 40, option: 'c', radius, post: 1 });
}
await writeFile(out, JSON.stringify({ ...config, modes: ['whole'], routes }, null, 2));
