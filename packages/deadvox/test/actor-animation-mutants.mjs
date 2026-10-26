import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { stdout } from 'node:process';
import { stripVTControlCharacters } from 'node:util';

const mutants = [
  {
    name: 'observer orientation reaches actor aim',
    path: 'src/render/heldViews.ts',
    before: 'world.syncHeldView(pose, frame, recoil);',
    after:
      'world.syncHeldView(pose, { ...frame, aim: { yaw: observer.rotation.y, pitch: observer.rotation.x } }, recoil);',
    test: 'orbit and spectator orientation cannot change world handling transforms for the same actor input',
  },
  {
    name: 'arm solve precedes the final movers',
    path: 'src/render/actorAnimator.ts',
    before: '    this.poseArms(firearmPoses);',
    after: '',
    test: 'final arm solving samples the rummage mover output in world and overlay, and cancellation restores grips',
    moveBefore: '    this.poseRummage(renderPose, handling);',
  },
];

for (const mutant of mutants) {
  const original = readFileSync(mutant.path, 'utf8');
  if (original.split(mutant.before).length !== 2) {
    throw new Error(`Mutation site is not unique: ${mutant.path}`);
  }
  let changed = original.replace(mutant.before, mutant.after);
  if (mutant.moveBefore) {
    if (changed.split(mutant.moveBefore).length !== 2) {
      throw new Error(`Ordering site is not unique: ${mutant.path}`);
    }
    changed = changed.replace(mutant.moveBefore, `${mutant.before}\n${mutant.moveBefore}`);
  }
  try {
    writeFileSync(mutant.path, changed);
    const result = spawnSync('npx', ['vitest', 'run', 'test/actorAnimator.test.ts', '-t', mutant.test], {
      encoding: 'utf8',
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    stdout.write(`${output}\n`);
    if (
      result.status !== 1 ||
      !stripVTControlCharacters(output).includes(`FAIL  test/actorAnimator.test.ts > ${mutant.test}`)
    ) {
      throw new Error(`Mutant was not killed by its behaviour test: ${mutant.name}`);
    }
    stdout.write(`KILLED: ${mutant.name}\n`);
  } finally {
    writeFileSync(mutant.path, original);
  }
}
