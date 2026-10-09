import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PIN = JSON.parse(readFileSync(join(SCRIPT_DIR, 'runtime.json'), 'utf8'));
const PLATFORM_NAMES = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
const ARCH_NAMES = { x64: 'amd64', arm64: 'arm64' };

function verifyArchiveHash(archive, expectedHash) {
  const actualHash = createHash('sha256').update(archive).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(`go-jsonnet archive SHA-256 mismatch: expected ${expectedHash}, received ${actualHash}`);
  }
}

function executablePath() {
  const platform = PLATFORM_NAMES[process.platform];
  const arch = ARCH_NAMES[process.arch];
  const platformKey = `${platform}_${arch}`;
  if (!(platform && arch && PIN.sha256[platformKey])) {
    throw new Error(`Unsupported Jsonnet platform: ${process.platform}/${process.arch}`);
  }
  const name = process.platform === 'win32' ? 'jsonnet.exe' : 'jsonnet';
  return {
    platformKey,
    archiveName: `go-jsonnet_${PIN.version}_${platform}_${arch}.tar.gz`,
    executable: join(SCRIPT_DIR, 'bin', PIN.version, name),
  };
}

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

export function installJsonnetArchive(archive, expectedHash, targetDirectory) {
  verifyArchiveHash(archive, expectedHash);

  const executableName = process.platform === 'win32' ? 'jsonnet.exe' : 'jsonnet';
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'skelly-jsonnet-install-'));
  const archivePath = join(temporaryDirectory, 'go-jsonnet.tar.gz');
  const extractedDirectory = join(temporaryDirectory, 'unpacked');
  try {
    writeFileSync(archivePath, archive);
    mkdirSync(extractedDirectory);
    execFileSync('tar', ['-xzf', archivePath, '-C', extractedDirectory, executableName], {
      stdio: 'inherit',
    });
    const extractedExecutable = join(extractedDirectory, executableName);
    if (!existsSync(extractedExecutable)) {
      throw new Error(`go-jsonnet archive did not contain ${executableName}`);
    }
    mkdirSync(targetDirectory, { recursive: true });
    const executable = join(targetDirectory, executableName);
    copyFileSync(extractedExecutable, executable);
    if (process.platform !== 'win32') {
      chmodSync(executable, 0o755);
    }
    return executable;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function ensureJsonnet() {
  const { platformKey, archiveName, executable } = executablePath();
  if (existingBinaryIsPinnedVersion(executable)) {
    return executable;
  }

  const downloadUrl = `https://github.com/google/go-jsonnet/releases/download/v${PIN.version}/${archiveName}`;
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`go-jsonnet download failed (${response.status} ${response.statusText})`);
  }
  const archive = Buffer.from(await response.arrayBuffer());
  const installed = installJsonnetArchive(archive, PIN.sha256[platformKey], dirname(executable));
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
