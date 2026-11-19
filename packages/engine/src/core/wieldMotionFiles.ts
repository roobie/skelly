import { safeParse } from 'valibot';
import { schemaIssues } from './content.ts';
import {
  type DollRig,
  DollRigSchema,
  type WieldClip,
  type WieldMotions,
  WieldMotionsSchema,
} from './schema/wieldMotions.ts';

/**
 * The rig the engine poses wields on. A new revision may move, rename or add bones, so the pin bump that brings one
 * reviews what reads them before the clips load.
 */
export const WIELD_RIG = { id: 'doll', revision: 8 } as const;

interface WieldMotionIssue {
  readonly path: string;
  readonly message: string;
}

/** One row's parsed rig and clips, or their schema issues when either file fails its schema. */
const parseWieldMotionFiles = (
  rigData: unknown,
  clipsData: unknown,
): { readonly issues: WieldMotionIssue[] } | { readonly rig: DollRig; readonly motions: WieldMotions } => {
  const rig = safeParse(DollRigSchema, rigData);
  const motions = safeParse(WieldMotionsSchema, clipsData);
  if (rig.success && motions.success) {
    return { rig: rig.output, motions: motions.output };
  }
  return {
    issues: [
      ...(rig.success ? [] : schemaIssues('.rig', rig.issues)),
      ...(motions.success ? [] : schemaIssues('.clips', motions.issues)),
    ].map(({ source, path, message }) => ({ path: path ? `${source}.${path}` : source, message })),
  };
};

/** A clip's class: the leading part of its name, `<class>_<action>_<kind>`. */
const classOf = (name: string): string => name.split('_')[0]!;

const clipBoneIssues = (bones: ReadonlySet<string>, name: string, clip: WieldClip): WieldMotionIssue[] => {
  const path = `.clips.clips.${name}`;
  const named = new Set(clip.frames.flatMap(({ rotations }) => Object.keys(rotations)));
  const issues = [...named]
    .filter((bone) => !bones.has(bone))
    .map((bone) => ({ path: `${path}.frames`, message: `names bone ${bone}, which the rig lacks` }));
  if (clip.held && !bones.has(clip.held.bone)) {
    issues.push({
      path: `${path}.held.bone`,
      message: `seats the weapon on bone ${clip.held.bone}, which the rig lacks`,
    });
  }
  return issues;
};

/**
 * What one row's rig and wield clips, parsed from the files it names, disagree with: their schemas, the rig the engine
 * poses, the rig the clips name, the bones the clips turn and seat on, and whether each class holds a weapon in every
 * clip or in none.
 */
export const wieldMotionFileIssues = (rigData: unknown, clipsData: unknown): WieldMotionIssue[] => {
  const parsed = parseWieldMotionFiles(rigData, clipsData);
  if ('issues' in parsed) {
    return parsed.issues;
  }
  const { rig, motions } = parsed;
  const issues: WieldMotionIssue[] = [];
  if (rig.id !== WIELD_RIG.id || rig.revision !== WIELD_RIG.revision) {
    issues.push({
      path: '.rig',
      message: `must be rig ${WIELD_RIG.id} revision ${WIELD_RIG.revision}, not ${rig.id} revision ${rig.revision}`,
    });
  }
  if (motions.rig.id !== rig.id || motions.rig.revision !== rig.revision) {
    issues.push({ path: '.clips.rig', message: `must name the rig the row loads, ${rig.id} revision ${rig.revision}` });
  }
  const bones = new Set(rig.bones.map(({ id }) => id));
  const holds = new Map<string, Set<boolean>>();
  for (const [name, clip] of Object.entries(motions.clips)) {
    issues.push(...clipBoneIssues(bones, name, clip));
    const cls = classOf(name);
    holds.set(cls, (holds.get(cls) ?? new Set()).add(clip.held !== undefined));
  }
  for (const [cls, held] of holds) {
    if (held.size > 1) {
      issues.push({
        path: '.clips.clips',
        message: `class ${cls} must seat its weapon by held in every clip or in none`,
      });
    }
  }
  return issues;
};
