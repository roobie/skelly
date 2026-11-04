// The leaper's template: sampling ranges, look, mass, supports and budgets. Body construction is
// src/mob/leaper/plan.ts, buildLeaper; this file holds only the values it reads.
local range(min, max) = { min: min, max: max };

// Every colour is HSL so look tuning stays here; resolveMaterials replaces each placeholder colour.
local hsl = {
  // Pallid, faintly warm flesh: the sickly base read.
  skin: ['skinHue', 'skinSat', 'skinLight'],
  // Countershading: a bruised dark back over a pale belly, the ambusher's camouflage.
  dorsal: ['dorsalHue', 0.18, 'dorsalLight'],
  // Inside of the maw.
  maw: [350, 0.45, 0.16],
  // Claws, heel and elbow spurs, teeth.
  claw: [44, 0.36, 0.68],
  bone: [40, 0.22, 0.78],
  // The only glow: a jaundiced eye cluster, charged so the host can brighten it as the pounce telegraph.
  eye: [52, 0.85, 0.58],
};
local emission = { eye: 0.7 };
local charged = { eye: true };

{
  name: 'leaper',
  description: 'Ambush predator: waits coiled on folded hind springs and covers ground in one pounce.',
  bodyPlan: 'leaper',
  voxelSize: 0.5 / 12,
  bodyMassKg: 110,
  supportBones: ['foot.L', 'foot.R', 'hand.L', 'hand.R'],
  params: {
    scale: range(0.95, 1.05),
    haunch: range(0.92, 1.12),
    reach: range(0.94, 1.08),
    splay: range(0.92, 1.08),
    skull: range(0.92, 1.1),
    hump: range(0.88, 1.15),
    skinHue: range(6, 22),
    skinSat: range(0.16, 0.26),
    skinLight: range(0.56, 0.64),
    dorsalHue: range(318, 342),
    dorsalLight: range(0.33, 0.4),
  },
  materials: {
    [name]: { color: [0, 0, 0], emissive: std.get(emission, name, 0) }
            + (if std.objectHas(charged, name) then { charged: charged[name] } else {})
    for name in std.objectFields(hsl)
  },
  materialHsl: hsl,
  // At the template voxel size; plan.ts, budgetsFor, scales them to other grids. Totals catch a build
  // that lost or doubled a part. The groups guard the read: the hind springs stay the largest share, or the
  // body stops reading as a jumper, and the head stays small and slung low, or it reads as a crouched man.
  budgets: {
    totalVoxels: range(1500, 3200),
    totalTriangles: range(3600, 7200),
    groups: {
      hindSprings: { bones: ['thigh.*', 'shin.*', 'foot.*'], min: 1, max: 1e6, minFraction: 0.38 },
      head: { bones: ['head', 'jaw'], min: 1, max: 1e6, maxFraction: 0.12 },
    },
  },
}
