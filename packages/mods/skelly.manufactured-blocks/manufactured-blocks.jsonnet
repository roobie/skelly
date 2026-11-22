// Industrial surfaces. Ground-contact events are authored per block even when several blocks share a
// surface (`PILLARS.md`, "Content forward compatibility"); the compiled JSON spells each pair out.
local landings = import 'packages/mods/skelly.audio.impact/landings.libsonnet';
local footstepEvents = {
  stone: { player: 'footstep_stone' },
  wood: { player: 'footstep_wood' },
};

local materials = {
  asphalt: 'masonry', concrete: 'masonry',
  siding_red: 'timber', siding_blue: 'timber',
  galvanized: 'metal', bitumen_felt: 'masonry',
  hazard_yellow: 'metal', chain_link: 'metal', camo_woodland: 'timber',
  steel_joist: 'metal',
};
local block(id, name, color, surface, extra={}) =
  { id: id, material: materials[id], name: name, color: color, solid: true, drops: { default: 'item_drop_wood' } + landings.forBlock(materials[id]), footsteps: footstepEvents[surface] } + extra;

local asphalt = block('asphalt', 'Asphalt', '#3b3d40', 'stone', { pattern: 'noise', weatherable: true });
local paintedAsphalt = asphalt + { id: 'painted_asphalt', name: 'Painted asphalt', color: '#b9bcba' };

{
  blocks: [
    asphalt,
    paintedAsphalt,
    block('concrete', 'Concrete', '#b5b3ad', 'stone', { pattern: 'noise', weatherable: true }),
    block('siding_red', 'Painted siding (faded red)', '#8f4b4b', 'stone', { pattern: 'siding', weatherable: true }),
    block('siding_blue', 'Painted siding (faded blue-grey)', '#7a8d94', 'stone', { pattern: 'siding', weatherable: true }),
    block('galvanized', 'Galvanized sheet', '#aab4b8', 'stone', { pattern: 'corrugated', weatherable: false }),
    // The felt is laid over a slab, so a cell of it breaks and falls as the masonry it covers.
    block('bitumen_felt', 'Bitumen roofing felt', '#3a3a3c', 'stone', { pattern: 'noise', weatherable: true }),
    block('hazard_yellow', 'Hazard paint', '#c9a43a', 'stone', { weatherable: false }),
    // A rolled steel section in red-oxide primer: a beam that carries a slab across a room wider than masonry spans.
    block('steel_joist', 'Steel joist', '#6e4436', 'stone', { weatherable: false }),
    block('chain_link', 'Chain-link fence', '#89979a', 'stone', {
      weatherable: false,
      opaque: false,
      soundBlocking: false,
      meleePass: { motions: ['thrust'], minimumActorReachMetres: 1 },
      wireMesh: { cellsPerBlock: 4, wireFraction: 0.08 },
      fencePosts: { widthBlocks: 0.12, spacingBlocks: 6 },
    }),
    block('camo_woodland', 'Weathered woodland camouflage', '#777b6a', 'stone', {
      pattern: 'camo',
      weatherable: true,
      patternPalette: ['#53694d', '#78634d', '#9b8a6b', '#3b4039'],
      patternWashout: 0.42,
    }),
  ],
}
