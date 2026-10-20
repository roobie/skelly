import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ROUNDS = {
  1: { url: 'https://deadvox-playtest-round1.surge.sh/', playPath: 'play/', playQuery: 'site=playtest' },
  2: { url: 'https://deadvox-playtest-round2.surge.sh/', playPath: 'play/', playQuery: 'site=gauntlet' },
};
const FULL_SHA_PATTERN = /^[a-f\d]{40}$/;
const DEPENDENCY_ROOTS = ['', 'packages/deadvox/tools/lit-check'];

export const playtestRound = (round) => {
  const config = ROUNDS[round];
  if (!config) {
    throw new Error(`Unknown playtest round: ${round}`);
  }
  return config;
};

export const gitEnvironment = () => {
  // Git hooks export repository bindings that must not redirect a fixture or detached game checkout.
  // biome-ignore lint/style/noProcessEnv: child processes retain caller settings except Git's local repository bindings.
  const environment = { ...process.env };
  const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
    .trim()
    .split('\n');
  for (const name of localVariables) {
    delete environment[name];
  }
  return environment;
};

const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env: gitEnvironment() }).trim();
const cleanRevision = (root) => {
  const changes = git(root, 'status', '--porcelain', '--untracked-files=all');
  if (changes) {
    throw new Error(`Playtest publishing requires a clean checkout, including untracked files:\n${changes}`);
  }
  return git(root, 'rev-parse', 'HEAD');
};

const reuseDependencies = (root, checkout) => {
  for (const directory of DEPENDENCY_ROOTS) {
    const lock = join(directory, 'package-lock.json');
    if (!existsSync(join(checkout, lock))) {
      continue;
    }
    if (!readFileSync(join(root, lock)).equals(readFileSync(join(checkout, lock)))) {
      throw new Error(
        `Frozen game dependencies differ at ${lock}; use a checkout with matching installed dependencies.`,
      );
    }
    const modules = join(root, directory, 'node_modules');
    if (!existsSync(modules)) {
      throw new Error(`Missing installed dependencies: ${modules}. Run npm run setup first.`);
    }
    const target = join(checkout, directory, 'node_modules');
    execFileSync('cp', ['-al', modules, target]);
    for (const cache of ['.vite', '.vite-temp', '.cache']) {
      rmSync(join(target, cache), { recursive: true, force: true });
    }
  }
  const runtime = 'tools/jsonnet/runtime.json';
  if (existsSync(join(checkout, runtime))) {
    if (!readFileSync(join(root, runtime)).equals(readFileSync(join(checkout, runtime)))) {
      throw new Error('Frozen game requires a different Jsonnet runtime; use a matching checkout.');
    }
    execFileSync('cp', ['-al', join(root, 'tools/jsonnet/bin'), join(checkout, 'tools/jsonnet/bin')]);
  }
};

const buildGame = (root, gameSha, output) => {
  // Dependency hard links need the checkout on the same filesystem; symlinks escape the source fingerprint boundary.
  const temporary = mkdtempSync(join(root, 'packages/deadvox/dist-playtest/.build-'));
  const checkout = join(temporary, 'checkout');
  let added = false;
  try {
    git(root, 'worktree', 'add', '--quiet', '--detach', checkout, gameSha);
    added = true;
    reuseDependencies(root, checkout);
    execFileSync('npm', ['run', 'build'], {
      cwd: join(checkout, 'packages/deadvox'),
      stdio: 'inherit',
      env: { ...gitEnvironment(), PAGES_ANALYTICS: '1' },
    });
    if (cleanRevision(checkout) !== gameSha) {
      throw new Error('Game build changed its frozen checkout; refusing publication.');
    }
    cpSync(join(checkout, 'packages/deadvox/dist'), output, { recursive: true });
  } finally {
    try {
      if (added) {
        git(root, 'worktree', 'remove', '--force', checkout);
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
};

export const publishPlaytest = ({ round, gameSha, dryRun = false, root = ROOT }) => {
  const config = playtestRound(round);
  if (!(FULL_SHA_PATTERN.test(gameSha ?? '') && git(root, 'rev-parse', `${gameSha}^{commit}`) === gameSha)) {
    throw new Error('Choose --game-sha with the full frozen game commit SHA.');
  }
  const landingSha = cleanRevision(root);
  const output = join(root, 'packages/deadvox/dist-playtest', String(round));
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  cpSync(join(root, 'packages/deadvox/playtests', `round${round}`), output, { recursive: true });
  for (const file of ['styles.css', 'playtestCatalog.js', 'playtestLanguage.js', 'playtest.json', 'assets']) {
    cpSync(join(root, 'site', file), join(output, file), { recursive: true });
  }
  for (const file of ['index.html', `round${round}.js`]) {
    const path = join(output, file);
    const source = readFileSync(path, 'utf8')
      .replaceAll('../../../../site/', './')
      .replaceAll('{{ROUND_URL}}', config.url)
      .replaceAll('{{PLAY_URL}}', `${config.playPath}?${config.playQuery}`);
    writeFileSync(path, source);
  }
  buildGame(root, gameSha, join(output, config.playPath));
  writeFileSync(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  if (cleanRevision(root) !== landingSha) {
    throw new Error('Landing checkout changed during assembly; refusing publication.');
  }
  if (!dryRun) {
    execFileSync('mise', ['x', '--', 'surge', output, new URL(config.url).hostname], {
      cwd: root,
      stdio: 'inherit',
    });
  }
  process.stdout.write(
    `${dryRun ? 'Assembled (dry run)' : 'Published'} landing ${landingSha}, game ${gameSha} → ${config.url} (${output})\n`,
  );
  return { output, landingSha, gameSha };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      round: { type: 'string' },
      'game-sha': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  try {
    publishPlaytest({ round: values.round, gameSha: values['game-sha'], dryRun: values['dry-run'] });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
