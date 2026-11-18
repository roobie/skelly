import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { download, extractTarGz, verifySha256 } from '../pinned-download.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
/** @type {{ version: string, released: string, sha256: Record<string, string> }} */
const PIN = JSON.parse(readFileSync(join(SCRIPT_DIR, 'runtime.json'), 'utf8'));
/** @type {Partial<Record<NodeJS.Platform, string>>} */
const PLATFORM_NAMES = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
/** @type {Partial<Record<NodeJS.Architecture, string>>} */
const ARCH_NAMES = { x64: 'amd64', arm64: 'arm64' };
const ARCHIVE_LABEL = 'go-jsonnet archive';
// The compile cache keys each output on the import closure `jsonnet-deps` reports; see `tools/jsonnet/compile.mjs`, `cacheKey`.
const TOOL_NAMES = ['jsonnet', 'jsonnet-deps'];

function executableNames() {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return TOOL_NAMES.map((name) => `${name}${suffix}`);
}

function executablePath() {
  const platform = PLATFORM_NAMES[process.platform];
  const arch = ARCH_NAMES[process.arch];
  const platformKey = `${platform}_${arch}`;
  const expectedHash = PIN.sha256[platformKey];
  if (!(platform && arch && expectedHash)) {
    throw new Error(`Unsupported Jsonnet platform: ${process.platform}/${process.arch}`);
  }
  const directory = join(SCRIPT_DIR, 'bin', PIN.version);
  return {
    platformKey,
    expectedHash,
    archiveName: `go-jsonnet_${PIN.version}_${platform}_${arch}.tar.gz`,
    directory,
    executables: executableNames().map((name) => join(directory, name)),
  };
}

/** @param {string} binary */
function existingBinaryIsPinnedVersion(binary) {
  if (!existsSync(binary)) {
    return false;
  }
  try {
    const version = execFileSync(binary, ['--version'], { encoding: 'utf8' });
    return version.includes(`v${PIN.version}`);
  } catch {
    return false;
  }
}

/**
 * @param {Buffer} archive
 * @param {string} expectedHash
 * @param {string} targetDirectory
 */
export function installJsonnetArchive(archive, expectedHash, targetDirectory) {
  verifySha256(archive, expectedHash, ARCHIVE_LABEL);

  const names = executableNames();
  const { directory, unpacked } = extractTarGz(archive, names);
  try {
    for (const name of names) {
      if (!existsSync(join(unpacked, name))) {
        throw new Error(`go-jsonnet archive did not contain ${name}`);
      }
    }
    mkdirSync(targetDirectory, { recursive: true });
    const executables = names.map((name) => {
      const executable = join(targetDirectory, name);
      copyFileSync(join(unpacked, name), executable);
      if (process.platform !== 'win32') {
        chmodSync(executable, 0o755);
      }
      return executable;
    });
    return executables[0];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function ensureJsonnet() {
  const { platformKey, expectedHash, archiveName, directory, executables } = executablePath();
  if (executables.every(existingBinaryIsPinnedVersion)) {
    return executables[0];
  }

  const downloadUrl = `https://github.com/google/go-jsonnet/releases/download/v${PIN.version}/${archiveName}`;
  const archive = await download(downloadUrl, ARCHIVE_LABEL);
  const installed = installJsonnetArchive(archive, expectedHash, directory);
  process.stdout.write(`Installed pinned go-jsonnet ${PIN.version} for ${platformKey}.\n`);
  return installed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await ensureJsonnet();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
