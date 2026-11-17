// A bestiary mob shares the shambler's senses, voice and gore until its own are authored; its body, clips
// and corpse come from the bestiary build, which cuts it into no severed parts.
local shambler = [actor for actor in (import 'packages/deadvox/mods/skelly.deadvox.actors/enemies.jsonnet').actors if actor.id == 'shambler'][0];
local body = import 'packages/skelly-assets/built/skelly.bestiary/actors/leaper.body.json';
local rake = {
  id: 'rake', weight: 1, damage: 8, damageKind: 'cut', motion: 'swing',
  hitRegions: [{ region: 'torso', weight: 4 }, { region: 'leftArm', weight: 2 },
               { region: 'rightArm', weight: 2 }, { region: 'leftLeg', weight: 1 }, { region: 'rightLeg', weight: 1 }],
};
{
  actors: [shambler + {
    id: 'leaper', name: 'Leaper', cause: 'a leaper', model: 'leaper', figureSeeds: [body.seed],
    authoredOnly: true, strength: 3,
    capability:: null, loot:: null, stagger:: null,
    severedItems: null,
    regions: { head: 40, torso: 45, leftArm: 18, rightArm: 18, leftLeg: 18, rightLeg: 18 },
    speed: { wanderMetresPerSimSecond: 0.58, chaseMetresPerSimSecond: 5.5, crawlMetresPerSimSecond: 0.6 },
    stepLength: 0.95, eyeHeightMetres: 0.8, earHeightMetres: 0.8,
    attack: { reach: 1.1, cooldownSimSeconds: 1.4, windupSimSeconds: 0.5, grabBandMetres: 1.4, moves: [rake] },
    dismember: { chance: 0.12, headOnKillChance: 0.2 },
    abilities: ['pounce'],
    // The band brackets the pounce clip's baked travel, so a pounce from inside it comes down on the player.
    pounce: {
      rangeBand: { nearMetres: 3, farMetres: 4.5 }, cooldownSimSeconds: 4,
      moves: [{ id: 'pounce', weight: 1, damage: 14, damageKind: 'cut',
                hitRegions: [{ region: 'torso', weight: 4 }, { region: 'head', weight: 2 },
                             { region: 'leftArm', weight: 1 }, { region: 'rightArm', weight: 1 }] }],
    },
  }],
}
