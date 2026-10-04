// biome-ignore-all lint/correctness/noNodejsModules: native Node.js browser-contract entry points use this profile allocator.
import { readlinkSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeOwnedTempDirectory, ownerIsAlive } from '../../testTemp.ts';

const profileRoot = join(tmpdir(), 'deadvox-browser-profiles');
const CHROME_LOCK_OWNER = /^(.*)-([1-9]\d*)$/;

const chromeOwnerIsAlive = (profile) => {
  let target;
  try {
    target = readlinkSync(join(profile, 'SingletonLock'));
  } catch (error) {
    return error.code !== 'ENOENT';
  }
  const match = CHROME_LOCK_OWNER.exec(target);
  if (!match || match[1] !== hostname()) {
    return true;
  }
  return ownerIsAlive(Number(match[2]));
};

export const createBrowserProfile = () => makeOwnedTempDirectory(profileRoot, chromeOwnerIsAlive);
