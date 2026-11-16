// An override replaces the whole row, so this one starts from the row the actors pack already overrides.
local actors = (import 'packages/deadvox/mods/skelly.deadvox.actors/graphics-actors.jsonnet').graphics[0];
{
  graphics: [actors + {
    shaderPreparation+: { mainChainWhileLoading: true },
  }],
}
