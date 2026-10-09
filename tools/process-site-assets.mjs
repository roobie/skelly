// biome-ignore-all lint/correctness/noNodejsModules: this command-line asset processor runs only under Node.
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const [logoSource, backdropSource] = process.argv.slice(2);
if (!(logoSource && backdropSource) || process.argv.length !== 4) {
  process.stderr.write('Usage: npm run process:site-assets -- <logo.png> <backdrop.jpg>\n');
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(repoRoot, 'site', 'assets');
const logoOutput = path.join(assetsDir, 'deadvox-survival-logo.webp');
const backdropOutput = path.join(assetsDir, 'deadvox-backdrop.jpg');

await mkdir(assetsDir, { recursive: true });
await sharp(path.resolve(logoSource))
  .resize({ width: 1200, withoutEnlargement: true })
  .webp({ quality: 85, alphaQuality: 100, effort: 6 })
  .toFile(logoOutput);
await copyFile(path.resolve(backdropSource), backdropOutput);
process.stdout.write(`Processed logo: ${path.relative(repoRoot, logoOutput)}\n`);
process.stdout.write(`Copied backdrop: ${path.relative(repoRoot, backdropOutput)}\n`);
