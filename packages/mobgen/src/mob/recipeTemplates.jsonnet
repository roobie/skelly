// Recipe mobs: a base template plus steps applied on top of its body plan (src/core/recipe.ts).
// A recipe is a list of steps, so mixing recipes is list concatenation, and order matters: a graft
// copies whatever the earlier steps put on the subtree it copies.
local step = import 'recipeSteps.libsonnet';
local r = step.range;
local material(color, emissive=0) = { color: color, emissive: emissive };

local decay = {
  pus: material([0.72, 0.66, 0.32]),
  rot: material([0.36, 0.3, 0.22]),
};

local bloat = [
  step.swell('gut', ['pelvis', 'spine', 'chest'], r(1.25, 1.55)),
  step.scatter('pustules', ['spine', 'chest', 'upperArm.*'], 'pus', r(5, 12), r(0.03, 0.05), r(0.1, 0.5)),
  step.paint('mottle', ['spine', 'chest', 'upperArm.*'], 'rot', ['skin'], r(0.3, 0.5), r(0.09, 0.15)),
];

local extraArms = [
  step.graft('lowerArmL', 'upperArm.L', 'spine', 'lower.', [r(0.01, 0.04), r(-0.24, -0.18), r(0, 0.04)], [0, r(-15, 5), r(-12, 0)], r(0.8, 0.95)),
  step.graft('lowerArmR', 'upperArm.R', 'spine', 'lower.', [r(-0.04, -0.01), r(-0.24, -0.18), r(0, 0.04)], [0, r(-5, 15), r(0, 12)], r(0.8, 0.95)),
];

local recipe(name, description, steps, materials={}) = {
  name: name,
  description: description,
  base: 'shambler',
  // Recipes are experiments until approved; consumableTemplate refuses them.
  status: 'comparison-only',
  materials: materials,
  recipe: steps,
};

[
  recipe('bloater', 'A shambler with a swollen trunk, pustules and rot mottling.', bloat, decay),
  recipe('grasper', 'A shambler with a second, smaller pair of arms grafted below the first.', extraArms),
  recipe('bloated-grasper', 'The bloater and grasper recipes mixed; bloating first, so the grafted arms copy the pustules on the arms they copy.', bloat + extraArms, decay),
]
