(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    riot_helmet_view: ['glass', 'polymer'],
    stab_vest: ['cloth', 'cloth'],
    hoodie: ['cloth', 'polymer'],
    jacket: ['cloth', 'polymer'],
    jeans: ['cloth'],
    rubber_boots: ['polymer', 'polymer'],
    school_backpack_worn: ['cloth', 'polymer', 'polymer'],
    school_backpack_worn_jacket: ['cloth', 'polymer', 'polymer'],
    fanny_pack_worn: ['cloth', 'polymer'],
    fanny_pack_worn_jacket: ['cloth', 'polymer'],
    utility_vest: ['cloth', 'polymer'],
    utility_vest_worn: ['cloth', 'cloth'],
    utility_vest_worn_jacket: ['cloth', 'cloth'],
    stab_vest_worn: ['cloth', 'polymer'],
    stab_vest_worn_jacket: ['cloth', 'polymer'],
    baseball_cap: ['cloth', 'polymer'],
    hoodie_worn_body: ['cloth', 'polymer'],
    hoodie_worn_fore: ['cloth', 'polymer'],
    hoodie_worn_upper: ['cloth'],
    combat_boots_worn_foot: ['polymer', 'cloth', 'polymer', 'cloth'],
    combat_boots_worn_shaft: ['cloth', 'polymer', 'cloth'],
    leather_gloves_worn_palm: ['organic', 'cloth'],
    bronze_helmet: ['metal', 'cloth'],
    conical_helm: ['metal', 'organic', 'organic'],
    corinthian_helm: ['metal', 'cloth'],
    ninja_hood: ['cloth', 'cloth', 'cloth'],
    leather_jacket_worn_body: ['organic', 'metal'],
    leather_jacket_worn_fore: ['organic'],
    leather_jacket_worn_upper: ['organic'],
    wizard_hat: ['cloth', 'metal'],
  } + {
    // One shell per finger bone and per thumb bone: `index`, `index2`, `index3` and so on.
    ['leather_gloves_worn_' + digit + suffix]: ['organic']
    for digit in ['index', 'middle', 'ring', 'little', 'thumb']
    for suffix in ['', '2', '3']
  },
).pack({
  models: [
    { id: 'stab_vest', file: 'assets/models/stab_vest.glb' },
    { id: 'riot_helmet_view', file: 'assets/models/riot_helmet_view.glb' },
  ] + ((import 'tools/jsonnet/lib/used-models.libsonnet')(import 'packages/skelly-assets/built/skelly.wearables/things/index.json', [import 'wearables-items.jsonnet', import 'packages/mods/skelly.containers/containers-items.jsonnet', import 'packages/deadvox/mods/skelly.deadvox.scenario.playtest/items-playtest.jsonnet'])),
})
