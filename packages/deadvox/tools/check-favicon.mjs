// biome-ignore-all lint/correctness/noNodejsModules: Node-only check runs after the Vite build.
import { readFileSync } from 'node:fs';

const link = /<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg" \/>/;
for (const page of ['index.html', 'sounds.html']) {
  if (!link.test(readFileSync(page, 'utf8'))) {
    throw new Error(`${page} must link the SVG favicon`);
  }
  if (!link.test(readFileSync(`dist/${page}`, 'utf8'))) {
    throw new Error(`dist/${page} must retain the SVG favicon link`);
  }
}
const source = readFileSync('public/favicon.svg');
if (source.byteLength >= 1024) {
  throw new Error('public/favicon.svg must stay under 1 KB');
}
if (!readFileSync('dist/favicon.svg').equals(source)) {
  throw new Error('the build must include the public favicon unchanged');
}
