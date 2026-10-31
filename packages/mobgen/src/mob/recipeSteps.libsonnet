// Step constructors for Mobgen recipes. The operators and their params are owned by
// src/mob/recipeOps.ts; a step's id names its genome params, so keep ids stable while tuning.
{
  range(min, max):: { min: min, max: max },

  swell(id, bones, factor):: {
    id: id,
    op: 'swell',
    bones: bones,
    params: { factor: factor },
  },

  scatter(id, bones, material, count, radius, lift):: {
    id: id,
    op: 'scatter',
    bones: bones,
    material: material,
    params: { count: count, radius: radius, lift: lift },
  },

  paint(id, bones, material, onto, coverage, grain):: {
    id: id,
    op: 'paint',
    bones: bones,
    material: material,
    onto: onto,
    params: { coverage: coverage, grain: grain },
  },

  graft(id, root, parent, prefix, offset=[0, 0, 0], rotate=[0, 0, 0], scale=1):: {
    id: id,
    op: 'graft',
    root: root,
    parent: parent,
    prefix: prefix,
    params: {
      offsetX: offset[0],
      offsetY: offset[1],
      offsetZ: offset[2],
      rotateX: rotate[0],
      rotateY: rotate[1],
      rotateZ: rotate[2],
      scale: scale,
    },
  },
}
