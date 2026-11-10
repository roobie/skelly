local figureSeeds = std.range(1, 8);
// Each drawn seed needs its own built figure; `packages/engine/src/core/content.ts`, `actorFigureIssues`,
// refuses a seed without one rather than substituting another. Crawler and acid figures are built only
// for the seeds their producer accepts, so their content authors separate seed lists.
local crawlerFigureSeeds = [1, 2, 3, 5, 6, 7, 11];
local acidFigureSeeds = [1, 2, 3, 4, 6, 8];
local severedItems = {
  head: 'shambler_head', torso: 'shambler_torso',
  leftArm: 'shambler_left_arm', rightArm: 'shambler_right_arm',
  leftLeg: 'shambler_left_leg', rightLeg: 'shambler_right_leg',
};
local resistanceFor(amount) = { [region]: amount for region in std.objectFields(severedItems) };
local neutralDamageResistance = {
  [kind]: resistanceFor(0) for kind in ['blunt', 'cut', 'pierce', 'acid', 'blast', 'fragment', 'breach', 'crush']
};
local agent = {
  sight: 25, nightSight: 10, stimulusMemorySimSeconds: 180, sightCone: 60,
  hearing: 1,
  hearingRange: { walk: 3, jog: 8, sprint: 15 },
  hordeSpacing: { innerMetres: 0.35, stepMetres: 0.38 },
  speed: { backgroundStepMetres: 1 },
  idleSound: {
    intervalSimSeconds: { min: 8, max: 20 },
    density: { radiusMetres: 8, penaltyPerNeighbour: 0.25 },
  },
  wander: {
    obstacleWanderChance: 0.25, obstacleWanderDistanceMetres: 10,
    wayAroundReachMetres: 2, wayAroundMinGainFraction: 0.25,
    idleSimSeconds: { min: 3, max: 10 }, strollSimSeconds: { min: 3, max: 12 },
    leashMetres: 12, lookIntervalSimSeconds: { min: 0.8, max: 1.8 },
    bodyLookArcDegrees: 150, headLookArcDegrees: 100,
  },
  hearingModel: {
    farMultiplier: 2, bearingErrorRadians: 0.61, investigationDistanceMetres: 8,
    searchSimSeconds: { min: 40, max: 50 }, searchRadiusMetres: 4,
    searchStrollSimSeconds: { min: 1, max: 3 },
    loudNoiseRadiusMetres: 30, hesitationSimSeconds: { min: 5, max: 5 },
    refusalSuspicionSimSeconds: 20, refusalLean: 0.75,
    alertCooldownSimSeconds: 60, chainRadiusMetres: 8, chainChance: 0.35,
  },
};
local motion = {
  bodyTurnDegreesPerSimSecond: 90, headTurnDegreesPerSimSecond: 120,
  movementAccelerationMetresPerSimSecondSquared: 4,
};
local chaseMotion = {
  swayDegrees: 25, swayIntervalSimSeconds: { min: 0.7, max: 1.1 },
  speedMultiplier: { min: 0.6, max: 1.2 }, lurchSimSeconds: 1,
  stumbleChancePerSimSecond: 0.16, stumbleDurationSimSeconds: { min: 0.55, max: 0.75 },
  stumbleEaseSimSeconds: 0.2, stumbleSpeedFraction: 0.04,
  stumbleDecelerationMetresPerSimSecondSquared: 14,
};
local clobber(damage, weight) = {
  id: 'clobber', weight: weight, damage: damage, damageKind: 'blunt',
  hitRegions: [{ region: 'torso', weight: 6 }, { region: 'head', weight: 2 },
               { region: 'leftArm', weight: 1 }, { region: 'rightArm', weight: 1 }],
};
local bite = {
  id: 'bite', weight: 1, damage: 5, damageKind: 'pierce',
  hitRegions: [{ region: 'leftArm', weight: 3 }, { region: 'rightArm', weight: 3 },
               { region: 'torso', weight: 2 }, { region: 'head', weight: 1 }],
};
local shambler = {
  id: 'shambler', name: 'Shambler', cause: 'a shambler', model: 'humanoid',
  figureSeeds: figureSeeds, strength: 5, canJumpObstacles: true, spawnWeight: 1,
  footstepSound: 'shambler',
  sounds: { idle: 'shambler_idle', alert: 'shambler_alert', attack: 'shambler_attack', hurt: 'shambler_hurt' },
  regions: { head: 60, torso: 60, leftArm: 24, rightArm: 24, leftLeg: 24, rightLeg: 24 },
  damageResistance: neutralDamageResistance,
  speed: { wanderMetresPerSimSecond: 0.8, chaseMetresPerSimSecond: 2.8 }, stepLength: 0.6,
  eyeHeightMetres: 1.3, earHeightMetres: 1.3, motion: motion,
  agent: agent, chaseMotion: chaseMotion,
  attack: { reach: 1.2, cooldownSimSeconds: 1.5, windupSimSeconds: 0.3, grabBandMetres: 1.7,
            moves: [clobber(9, 3), bite] },
  stagger: { impulseThreshold: 12, durationSimSeconds: 0.8 },
  dismember: { chance: 0.15, headOnKillChance: 0.25 },
  downed: { finishOff: { simSeconds: 3 }, dismember: { simSeconds: 15, quality: 'cutting', level: 1 } },
  abilities: [], loot: 'shambler_pockets',
};
local severedGore = {
  severedImpulseScale: 1.3,
  severedSpurt: { droplets: 14, speedMetresPerRealSecond: 5, spreadFraction: 1.5, lifetimeRealSeconds: 4.5, partVelocityShare: 0.8 },
};
local meleeMotions = { clobber: 'swing', bite: 'wrestle', tentacle_strike: 'thrust' };
local actors = [
  shambler,
  shambler + { id: 'military_shambler', name: 'Soldier', cause: 'a soldier', authoredOnly: true, loot: 'soldier_pockets' },
  shambler + { id: 'farmer_shambler', name: 'Farmer', cause: 'a farmer', authoredOnly: true, loot: 'farmer_pockets' },
  shambler + { id: 'worker_shambler', name: 'Site worker', cause: 'a site worker', authoredOnly: true, loot: 'worker_pockets' },
  shambler + { id: 'medic_shambler', name: 'Medic', cause: 'a medic', authoredOnly: true, loot: 'medic_pockets' },
  shambler + {
    id: 'brute_shambler', name: 'Brute', cause: 'a brute', figure: 'broad-humanoid', authoredOnly: true,
    // Heavy-hit response belongs to this figure's content (`docs/stagger.md`, "Which types stagger").
    stagger:: null,
    regions: { head: 120, torso: 120, leftArm: 48, rightArm: 48, leftLeg: 48, rightLeg: 48 },
    speed: { wanderMetresPerSimSecond: 0.8, chaseMetresPerSimSecond: 2.4 }, stepLength: 0.8,
    attack: { reach: 1.2, cooldownSimSeconds: 1.8, windupSimSeconds: 0.3, grabBandMetres: 1.7,
              moves: [clobber(14, 5), bite] },
  },
  shambler + {
    id: 'runner', name: 'Runner', cause: 'a runner', figure: 'slim-humanoid', strength: 4, spawnWeight: 0.12,
    footstepSound:: null, stagger:: null,
    sounds: { idle: 'runner_idle', alert: 'runner_alert', attack: 'runner_attack', hurt: 'runner_hurt' },
    regions: { head: 35, torso: 38, leftArm: 18, rightArm: 18, leftLeg: 18, rightLeg: 18 },
    speed: { wanderMetresPerSimSecond: 0.8, chaseMetresPerSimSecond: 6.5 }, stepLength: 0.8,
    chaseMotion: chaseMotion + { swayDegrees: 8, swayIntervalSimSeconds: { min: 0.8, max: 1.2 },
                                speedMultiplier: { min: 0.85, max: 1.05 }, lurchSimSeconds: 0.7, stumbleChancePerSimSecond: 0.03 },
    attack: { reach: 1.2, cooldownSimSeconds: 1.3, windupSimSeconds: 0.25, grabBandMetres: 1.7,
              moves: [clobber(9, 3), bite] },
    dismember: { chance: 0.1, headOnKillChance: 0.2 },
  },
  shambler + {
    id: 'crawler', name: 'Crawler', cause: 'a crawler', figure: 'legless-humanoid', figureSeeds: crawlerFigureSeeds,
    strength: 3, spawnWeight: 0.08, footstepSound:: null, stagger:: null,
    sounds: { idle: 'crawler_idle', alert: 'crawler_alert', attack: 'crawler_attack', hurt: 'crawler_hurt' },
    regions: { head: 40, torso: 50, leftArm: 18, rightArm: 18, leftLeg: 10, rightLeg: 10 },
    speed: { wanderMetresPerSimSecond: 0.35, chaseMetresPerSimSecond: 1.1 }, stepLength: 0.45,
    agent: agent + { sight: 16, nightSight: 7, sightCone: 55, hearingRange: { walk: 2, jog: 5, sprint: 9 } },
    chaseMotion: chaseMotion + { swayDegrees: 12, swayIntervalSimSeconds: { min: 0.8, max: 1.2 },
                                speedMultiplier: { min: 0.7, max: 1 }, stumbleChancePerSimSecond: 0.08 },
    attack: { reach: 1.2, cooldownSimSeconds: 1.7, windupSimSeconds: 0.4, grabBandMetres: 1.7,
              moves: [{ id: 'bite', weight: 1, damage: 6, damageKind: 'pierce',
                        hitRegions: [{ region: 'leftLeg', weight: 1 }, { region: 'rightLeg', weight: 1 }] }] },
    dismember: { chance: 0.05, headOnKillChance: 0.15 },
  },
  shambler + {
    id: 'amalgam', name: 'Amalgam', cause: 'an amalgam', model: 'fused-mass', canJumpObstacles: false,
    strength: 0, locomotion: 'omnidirectional', bodyScale: 4, soundPitchMultiplier: 0.5, authoredOnly: true,
    // The built body's collision box; `validate` fails when it no longer matches the pinned body.
    spawnEnvelope: { halfWidthMetres: 3, halfDepthMetres: 2.666666666666667, heightMetres: 4.666666666666666 },
    figureSeeds:: null, footstepSound:: null, stagger:: null, downed:: null,
    sounds: { idle: 'amalgam_idle', alert: 'amalgam_alert', attack: 'amalgam_attack', hurt: 'amalgam_hurt' },
    regions: { 'core.trunk': 2400, 'member.head': 60, 'member.torso': 60,
               'member.leftArm': 24, 'member.rightArm': 24, 'member.leftLeg': 24, 'member.rightLeg': 24 },
    speed: { wanderMetresPerSimSecond: 0.25, chaseMetresPerSimSecond: 1.4 },
    chaseMotion: chaseMotion + { swayDegrees: 0, speedMultiplier: { min: 1, max: 1 }, stumbleChancePerSimSecond: 0 },
    attack: { reach: 2.2, cooldownSimSeconds: 2.8, windupSimSeconds: 1,
              moves: [{ id: 'tentacle_strike', weight: 1, damage: 22, damageKind: 'blunt', hitRegions: clobber(9, 3).hitRegions }] },
    carving: { radiusMetresPerDamage: 0.0023, maxRadiusMetres: 0.75, interiorColor: '#7a1c16' },
  },
  shambler + {
    id: 'acid_zombie', name: 'Acid zombie', cause: 'an acid zombie', model: 'acid', figureSeeds: acidFigureSeeds, authoredOnly: true,
    acidBody: {
      color: '#9ad21e', charge: { idle: 0.5, charged: 2.5 }, light: { intensity: 0.33, radiusMetres: 3 },
      drips: { perRealSecond: 1.5, sizeMetres: 0.012 },
      deathSplash: { droplets: 24, speedMetresPerRealSecond: 3.5, slowestSpeedFraction: 0.5, sizeMetres: 0.02 },
    },
    sounds: { idle: 'acid_zombie_idle', alert: 'acid_zombie_alert', attack: 'acid_zombie_attack', hurt: 'acid_zombie_hurt' },
    damageResistance: neutralDamageResistance + { acid: resistanceFor(1) }, abilities: ['acidSpit'],
    acidSpit: {
      rangeBand: { nearMetres: 4, farMetres: 12 }, windupSimSeconds: 1.2, cooldownSimSeconds: 5,
      cancelPenaltyFraction: 0.5, spreadDegrees: 4, globMetresPerSimSecond: 21.9246,
      presentation: { color: '#8bff32', radiusMetres: 0.08, splashRadiusMetres: 0.3, splashRealSeconds: 0.25 },
      moves: [{ id: 'spit', weight: 1, damage: 6, damageKind: 'acid',
                hitRegions: [{ region: 'torso', weight: 5 }, { region: 'head', weight: 2 },
                             { region: 'leftArm', weight: 1 }, { region: 'rightArm', weight: 1 }] }],
      puddle: { damageKind: 'acid', lifetimeSimSeconds: 8, radiusMetres: 0.8, damagePerSimSecond: 2 },
    },
  },
];
{
  actors: [actor + severedGore + {
    jumpMetresPerSimSecond: 4.6761,
    speed+: { crawlMetresPerSimSecond: 0.4 },
    severedItems: if actor.model == 'fused-mass' then { [region]: null for region in std.objectFields(actor.regions) } else severedItems,
    attack+: { moves: [move + { motion: meleeMotions[move.id] } for move in actor.attack.moves] },
  } + (if actor.id == 'shambler' then { capability: ['settlementHorde', 'settlementWanderer'] } else {}) for actor in actors],
}
