import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { download, extractTarGz, verifySha256 } from '../pinned-download.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PIN = JSON.parse(readFileSync(join(SCRIPT_DIR, 'runtime.json'), 'utf8'));
const PLATFORM_NAMES = { linux: 'linux', darwin: 'darwin' };
const ARCH_NAMES = { x64: 'amd64', arm64: 'arm64' };
// shellcheck names its release archives after `uname`, not Go's platform names.
const SHELLCHECK_ARCH_NAMES = { amd64: 'x86_64', arm64: 'aarch64' };

const TOOLS = {
  actionlint: ({ version }, platform, arch) => ({
    url: `https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_${platform}_${arch}.tar.gz`,
    member: 'actionlint',
  }),
  shellcheck: ({ version }, platform, arch) => ({
    url: `https://github.com/koalaman/shellcheck/releases/download/v${version}/shellcheck-v${version}.${platform}.${SHELLCHECK_ARCH_NAMES[arch]}.tar.gz`,
    member: `shellcheck-v${version}/shellcheck`,
  }),
};

function platformKey() {
  const platform = PLATFORM_NAMES[process.platform];
  const arch = ARCH_NAMES[process.arch];
  if (!(platform && arch)) {
    throw new Error(`Unsupported workflow lint platform: ${process.platform}/${process.arch}`);
  }
  return { platform, arch, key: `${platform}_${arch}` };
}

function isPinnedVersion(executable, version) {
  if (!existsSync(executable)) {
    return false;
  }
  try {
    return execFileSync(executable, ['--version'], { encoding: 'utf8' }).includes(version);
  } catch {
    return false;
  }
}

async function ensureTool(name) {
  const pin = PIN[name];
  const { platform, arch, key } = platformKey();
  const executable = join(SCRIPT_DIR, 'bin', `${name}-${pin.version}`, name);
  if (isPinnedVersion(executable, pin.version)) {
    return executable;
  }
  const { url, member } = TOOLS[name](pin, platform, arch);
  const label = `${name} archive`;
  const archive = await download(url, label);
  verifySha256(archive, pin.sha256[key], label);
  const { directory, unpacked } = extractTarGz(archive, [member]);
  try {
    mkdirSync(dirname(executable), { recursive: true });
    copyFileSync(join(unpacked, member), executable);
    chmodSync(executable, 0o755);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  process.stdout.write(`Installed pinned ${name} ${pin.version} for ${key}.\n`);
  return executable;
}

/** Paths to the pinned actionlint and shellcheck, downloading and verifying whichever is missing. */
export async function ensureWorkflowLinters() {
  return { actionlint: await ensureTool('actionlint'), shellcheck: await ensureTool('shellcheck') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await ensureWorkflowLinters();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
