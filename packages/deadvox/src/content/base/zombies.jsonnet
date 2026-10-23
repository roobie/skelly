local figureSeeds = std.range(1, 8);
local severedItems = {
  head: 'shambler_head',
  torso: 'shambler_torso',
  leftArm: 'shambler_left_arm',
  rightArm: 'shambler_right_arm',
  leftLeg: 'shambler_left_leg',
  rightLeg: 'shambler_right_leg',
};
local senseHeightMetres = 1.3;
local hordeSpacing = { innerMetres: 0.35, stepMetres: 0.38 };
local grabBandMetres = 1.7;
local backgroundStepMetres = 1;

local meleeMotions = { clobber: 'swing', bite: 'wrestle', tentacle_strike: 'thrust' };
local content = {
  "zombies": [
    {
      "id": "shambler",
      "strength": 5,
      "name": "Shambler",
      "model": "shambler",
      "figureSeeds": figureSeeds,
      "canJumpObstacles": true,
      "spawnWeight": 1,
      "footstepSound": "shambler",
      "sounds": {
        "idle": "shambler_idle",
        "alert": "shambler_alert",
        "attack": "shambler_attack",
        "hurt": "shambler_hurt"
      },
      "regions": {
        "head": 60,
        "torso": 60,
        "leftArm": 24,
        "rightArm": 24,
        "leftLeg": 24,
        "rightLeg": 24
      },
      "meleeDamageResistance": {
        "head": { "blunt": 0, "cut": 0, "pierce": 0 },
        "torso": { "blunt": 0, "cut": 0, "pierce": 0 },
        "leftArm": { "blunt": 0, "cut": 0, "pierce": 0 },
        "rightArm": { "blunt": 0, "cut": 0, "pierce": 0 },
        "leftLeg": { "blunt": 0, "cut": 0, "pierce": 0 },
        "rightLeg": { "blunt": 0, "cut": 0, "pierce": 0 }
      },
      "speed": {
        "wanderMetresPerSimSecond": 0.8,
        "chaseMetresPerSimSecond": 2.8,
        "backgroundStepMetres": backgroundStepMetres
      },
      "stepLength": 0.6,
      "wander": {
        "obstacleWanderChance": 0.25,
        "obstacleWanderDistanceMetres": 10,
        "wayAroundReachMetres": 2,
        "wayAroundMinGainFraction": 0.25,
        "idleSimSeconds": { "min": 3, "max": 10 },
        "strollSimSeconds": { "min": 3, "max": 12 },
        "leashMetres": 12,
        "lookIntervalSimSeconds": { "min": 0.8, "max": 1.8 },
        "bodyLookArcDegrees": 150,
        "headLookArcDegrees": 100,
        "bodyTurnDegreesPerSimSecond": 90,
        "headTurnDegreesPerSimSecond": 120,
        "movementAccelerationMetresPerSimSecondSquared": 4
      },
      "sight": 25,
      "nightSight": 10,
      "stimulusMemorySimSeconds": 180,
      "sightCone": 60,
      "eyeHeightMetres": senseHeightMetres,
      "earHeightMetres": senseHeightMetres,
      "hordeSpacing": hordeSpacing,
      "hearing": 1,
      "hearingRange": { "walk": 3, "jog": 8, "sprint": 15 },
      "hearingModel": {
        "farMultiplier": 2,
        "bearingErrorRadians": 0.61,
        "investigationDistanceMetres": 8,
        "searchSimSeconds": { "min": 40, "max": 50 },
        "searchRadiusMetres": 4,
        "searchStrollSimSeconds": { "min": 1, "max": 3 }
      },
      "chaseMotion": {
        "swayDegrees": 25,
        "swayIntervalSimSeconds": { "min": 0.7, "max": 1.1 },
        "speedMultiplier": { "min": 0.6, "max": 1.2 },
        "lurchSimSeconds": 1,
        "stumbleChancePerSimSecond": 0.16,
        "stumbleDurationSimSeconds": { "min": 0.55, "max": 0.75 },
        "stumbleEaseSimSeconds": 0.2,
        "stumbleSpeedFraction": 0.04,
        "stumbleDecelerationMetresPerSimSecondSquared": 14
      },
      "attack": {
        "reach": 1.2,
        "cooldownSimSeconds": 1.5,
        "windupSimSeconds": 0.3,
        "grabBandMetres": grabBandMetres,
        "moves": [
          {
            "id": "clobber",
            "weight": 3,
            "damage": 9,
            "damageKind": "blunt",
            "hitRegions": [
              { "region": "torso", "weight": 6 },
              { "region": "head", "weight": 2 },
              { "region": "leftArm", "weight": 1 },
              { "region": "rightArm", "weight": 1 }
            ]
          },
          {
            "id": "bite",
            "weight": 1,
            "damage": 5,
            "damageKind": "pierce",
            "hitRegions": [
              { "region": "leftArm", "weight": 3 },
              { "region": "rightArm", "weight": 3 },
              { "region": "torso", "weight": 2 },
              { "region": "head", "weight": 1 }
            ]
          }
        ]
      },
      "stagger": { "impulseThreshold": 12, "durationSimSeconds": 0.8 },
      "dismember": {
        "chance": 0.15,
        "headOnKillChance": 0.25
      },
      "downed": {
        "finishOff": { "simSeconds": 3 },
        "dismember": { "simSeconds": 15, "quality": "cutting", "level": 1 }
      },
      "abilities": [],
      "loot": "shambler_pockets"
    },
    {
      "id": "military_shambler",
      "strength": 5,
      "name": "Soldier",
      "model": "shambler",
      "figureSeeds": figureSeeds,
      "canJumpObstacles": true,
      "spawnWeight": 1,
      "authoredOnly": true,
      "footstepSound": "shambler",
      "sounds": {
        "idle": "shambler_idle",
        "alert": "shambler_alert",
        "attack": "shambler_attack",
        "hurt": "shambler_hurt"
      },
      "regions": {
        "head": 60,
        "torso": 60,
        "leftArm": 24,
        "rightArm": 24,
        "leftLeg": 24,
        "rightLeg": 24
      },
      "meleeDamageResistance": {
        "head": { "blunt": 0, "cut": 0, "pierce": 0 },
        "torso": { "blunt": 0, "cut": 0, "pierce": 0 },
        "leftArm": { "blunt": 0, "cut": 0, "pierce": 0 },
        "rightArm": { "blunt": 0, "cut": 0, "pierce": 0 },
        "leftLeg": { "blunt": 0, "cut": 0, "pierce": 0 },
        "rightLeg": { "blunt": 0, "cut": 0, "pierce": 0 }
      },
      "speed": {
        "wanderMetresPerSimSecond": 0.8,
        "chaseMetresPerSimSecond": 2.8,
        "backgroundStepMetres": backgroundStepMetres
      },
      "stepLength": 0.6,
      "wander": {
        "obstacleWanderChance": 0.25,
        "obstacleWanderDistanceMetres": 10,
        "wayAroundReachMetres": 2,
        "wayAroundMinGainFraction": 0.25,
        "idleSimSeconds": { "min": 3, "max": 10 },
        "strollSimSeconds": { "min": 3, "max": 12 },
        "leashMetres": 12,
        "lookIntervalSimSeconds": { "min": 0.8, "max": 1.8 },
        "bodyLookArcDegrees": 150,
        "headLookArcDegrees": 100,
        "bodyTurnDegreesPerSimSecond": 90,
        "headTurnDegreesPerSimSecond": 120,
        "movementAccelerationMetresPerSimSecondSquared": 4
      },
      "sight": 25,
      "nightSight": 10,
      "stimulusMemorySimSeconds": 180,
      "sightCone": 60,
      "eyeHeightMetres": senseHeightMetres,
      "earHeightMetres": senseHeightMetres,
      "hordeSpacing": hordeSpacing,
      "hearing": 1,
      "hearingRange": { "walk": 3, "jog": 8, "sprint": 15 },
      "hearingModel": {
        "farMultiplier": 2,
        "bearingErrorRadians": 0.61,
        "investigationDistanceMetres": 8,
        "searchSimSeconds": { "min": 40, "max": 50 },
        "searchRadiusMetres": 4,
        "searchStrollSimSeconds": { "min": 1, "max": 3 }
      },
      "chaseMotion": {
        "swayDegrees": 25,
        "swayIntervalSimSeconds": { "min": 0.7, "max": 1.1 },
        "speedMultiplier": { "min": 0.6, "max": 1.2 },
        "lurchSimSeconds": 1,
        "stumbleChancePerSimSecond": 0.16,
        "stumbleDurationSimSeconds": { "min": 0.55, "max": 0.75 },
        "stumbleEaseSimSeconds": 0.2,
        "stumbleSpeedFraction": 0.04,
        "stumbleDecelerationMetresPerSimSecondSquared": 14
      },
      "attack": {
        "reach": 1.2,
        "cooldownSimSeconds": 1.5,
        "windupSimSeconds": 0.3,
        "grabBandMetres": grabBandMetres,
        "moves": [
          {
            "id": "clobber",
            "weight": 3,
            "damage": 9,
            "damageKind": "blunt",
            "hitRegions": [
              { "region": "torso", "weight": 6 },
              { "region": "head", "weight": 2 },
              { "region": "leftArm", "weight": 1 },
              { "region": "rightArm", "weight": 1 }
            ]
          },
          {
            "id": "bite",
            "weight": 1,
            "damage": 5,
            "damageKind": "pierce",
            "hitRegions": [
              { "region": "leftArm", "weight": 3 },
              { "region": "rightArm", "weight": 3 },
              { "region": "torso", "weight": 2 },
              { "region": "head", "weight": 1 }
            ]
          }
        ]
      },
      "stagger": { "impulseThreshold": 12, "durationSimSeconds": 0.8 },
      "dismember": {
        "chance": 0.15,
        "headOnKillChance": 0.25
      },
      "downed": {
        "finishOff": { "simSeconds": 3 },
        "dismember": { "simSeconds": 15, "quality": "cutting", "level": 1 }
      },
      "abilities": [],
      "loot": "soldier_pockets"
    },
    $.zombies[0] + {
      "id": "farmer_shambler",
      "name": "Farmer",
      "authoredOnly": true,
      "loot": "farmer_pockets"
    },
    $.zombies[0] + {
      "id": "worker_shambler",
      "name": "Site worker",
      "authoredOnly": true,
      "loot": "worker_pockets"
    },
    $.zombies[0] + {
      "id": "medic_shambler",
      "name": "Medic",
      "authoredOnly": true,
      "loot": "medic_pockets"
    },
    $.zombies[0] + {
      "id": "brute_shambler",
      "name": "Brute",
      "model": "brute",
      "authoredOnly": true,
      // How the brute answers heavy hits belongs to the tier-2 brute (`docs/stagger.md`, "Which types stagger").
      "stagger":: null,
      "regions": {
        "head": 120,
        "torso": 120,
        "leftArm": 48,
        "rightArm": 48,
        "leftLeg": 48,
        "rightLeg": 48
      },
      "speed": {
        "wanderMetresPerSimSecond": 0.8,
        "chaseMetresPerSimSecond": 2.4,
        "backgroundStepMetres": backgroundStepMetres
      },
      "stepLength": 0.8,
      "attack": {
        "reach": 1.2,
        "cooldownSimSeconds": 1.8,
        "windupSimSeconds": 0.3,
        "grabBandMetres": grabBandMetres,
        "moves": [
          {
            "id": "clobber",
            "weight": 5,
            "damage": 14,
            "damageKind": "blunt",
            "hitRegions": [
              { "region": "torso", "weight": 6 },
              { "region": "head", "weight": 2 },
              { "region": "leftArm", "weight": 1 },
              { "region": "rightArm", "weight": 1 }
            ]
          },
          {
            "id": "bite",
            "weight": 1,
            "damage": 5,
            "damageKind": "pierce",
            "hitRegions": [
              { "region": "leftArm", "weight": 3 },
              { "region": "rightArm", "weight": 3 },
              { "region": "torso", "weight": 2 },
              { "region": "head", "weight": 1 }
            ]
          }
        ]
      }
    },
    {
      "id": "runner",
      "strength": 4,
      "name": "Runner",
      "model": "runner",
      "figureSeeds": figureSeeds,
      "canJumpObstacles": true,
      "spawnWeight": 0.12,
      "sounds": {
        "idle": "runner_idle",
        "alert": "runner_alert",
        "attack": "runner_attack",
        "hurt": "runner_hurt"
      },
      "regions": {
        "head": 35,
        "torso": 38,
        "leftArm": 18,
        "rightArm": 18,
        "leftLeg": 18,
        "rightLeg": 18
      },
      "speed": { "wanderMetresPerSimSecond": 0.8, "chaseMetresPerSimSecond": 6.5, "backgroundStepMetres": backgroundStepMetres },
      "stepLength": 0.8,
      "sight": 25,
      "nightSight": 10,
      "stimulusMemorySimSeconds": 180,
      "sightCone": 60,
      "eyeHeightMetres": senseHeightMetres,
      "earHeightMetres": senseHeightMetres,
      "hordeSpacing": hordeSpacing,
      "hearing": 1,
      "hearingRange": { "walk": 3, "jog": 8, "sprint": 15 },
      "hearingModel": {
        "farMultiplier": 2,
        "bearingErrorRadians": 0.61,
        "investigationDistanceMetres": 8,
        "searchSimSeconds": { "min": 40, "max": 50 },
        "searchRadiusMetres": 4,
        "searchStrollSimSeconds": { "min": 1, "max": 3 }
      },
      "wander": {
        "obstacleWanderChance": 0.25,
        "obstacleWanderDistanceMetres": 10,
        "wayAroundReachMetres": 2,
        "wayAroundMinGainFraction": 0.25,
        "idleSimSeconds": { "min": 3, "max": 10 },
        "strollSimSeconds": { "min": 3, "max": 12 },
        "leashMetres": 12,
        "lookIntervalSimSeconds": { "min": 0.8, "max": 1.8 },
        "bodyLookArcDegrees": 150,
        "headLookArcDegrees": 100,
        "bodyTurnDegreesPerSimSecond": 90,
        "headTurnDegreesPerSimSecond": 120,
        "movementAccelerationMetresPerSimSecondSquared": 4
      },
      "chaseMotion": {
        "swayDegrees": 8,
        "swayIntervalSimSeconds": { "min": 0.8, "max": 1.2 },
        "speedMultiplier": { "min": 0.85, "max": 1.05 },
        "lurchSimSeconds": 0.7,
        "stumbleChancePerSimSecond": 0.03,
        "stumbleDurationSimSeconds": { "min": 0.55, "max": 0.75 },
        "stumbleEaseSimSeconds": 0.2,
        "stumbleSpeedFraction": 0.04,
        "stumbleDecelerationMetresPerSimSecondSquared": 14
      },
      "attack": {
        "reach": 1.2,
        "cooldownSimSeconds": 1.3,
        "windupSimSeconds": 0.25,
        "grabBandMetres": grabBandMetres,
        "moves": [
          {
            "id": "clobber",
            "weight": 3,
            "damage": 9,
            "damageKind": "blunt",
            "hitRegions": [
              { "region": "torso", "weight": 6 },
              { "region": "head", "weight": 2 },
              { "region": "leftArm", "weight": 1 },
              { "region": "rightArm", "weight": 1 }
            ]
          },
          {
            "id": "bite",
            "weight": 1,
            "damage": 5,
            "damageKind": "pierce",
            "hitRegions": [
              { "region": "leftArm", "weight": 3 },
              { "region": "rightArm", "weight": 3 },
              { "region": "torso", "weight": 2 },
              { "region": "head", "weight": 1 }
            ]
          }
        ]
      },
      "dismember": { "chance": 0.1, "headOnKillChance": 0.2 },
      "downed": {
        "finishOff": { "simSeconds": 3 },
        "dismember": { "simSeconds": 15, "quality": "cutting", "level": 1 }
      },
      "abilities": [],
      "loot": "shambler_pockets"
    },
    {
      "id": "crawler",
      "strength": 3,
      "name": "Crawler",
      "model": "shambler",
      "figureSeeds": figureSeeds,
      "canJumpObstacles": true,
      "spawnWeight": 0.08,
      "sounds": {
        "idle": "crawler_idle",
        "alert": "crawler_alert",
        "attack": "crawler_attack",
        "hurt": "crawler_hurt"
      },
      "regions": {
        "head": 40,
        "torso": 50,
        "leftArm": 18,
        "rightArm": 18,
        "leftLeg": 10,
        "rightLeg": 10
      },
      "speed": { "wanderMetresPerSimSecond": 0.35, "chaseMetresPerSimSecond": 1.1, "backgroundStepMetres": backgroundStepMetres },
      "stepLength": 0.45,
      "sight": 16,
      "nightSight": 7,
      "stimulusMemorySimSeconds": 180,
      "sightCone": 55,
      "eyeHeightMetres": senseHeightMetres,
      "earHeightMetres": senseHeightMetres,
      "hordeSpacing": hordeSpacing,
      "hearing": 1,
      "hearingRange": { "walk": 2, "jog": 5, "sprint": 9 },
      "hearingModel": {
        "farMultiplier": 2,
        "bearingErrorRadians": 0.61,
        "investigationDistanceMetres": 8,
        "searchSimSeconds": { "min": 40, "max": 50 },
        "searchRadiusMetres": 4,
        "searchStrollSimSeconds": { "min": 1, "max": 3 }
      },
      "wander": {
        "obstacleWanderChance": 0.25,
        "obstacleWanderDistanceMetres": 10,
        "wayAroundReachMetres": 2,
        "wayAroundMinGainFraction": 0.25,
        "idleSimSeconds": { "min": 3, "max": 10 },
        "strollSimSeconds": { "min": 3, "max": 12 },
        "leashMetres": 12,
        "lookIntervalSimSeconds": { "min": 0.8, "max": 1.8 },
        "bodyLookArcDegrees": 150,
        "headLookArcDegrees": 100,
        "bodyTurnDegreesPerSimSecond": 90,
        "headTurnDegreesPerSimSecond": 120,
        "movementAccelerationMetresPerSimSecondSquared": 4
      },
      "chaseMotion": {
        "swayDegrees": 12,
        "swayIntervalSimSeconds": { "min": 0.8, "max": 1.2 },
        "speedMultiplier": { "min": 0.7, "max": 1 },
        "lurchSimSeconds": 1,
        "stumbleChancePerSimSecond": 0.08,
        "stumbleDurationSimSeconds": { "min": 0.55, "max": 0.75 },
        "stumbleEaseSimSeconds": 0.2,
        "stumbleSpeedFraction": 0.04,
        "stumbleDecelerationMetresPerSimSecondSquared": 14
      },
      "attack": {
        "reach": 1.2,
        "cooldownSimSeconds": 1.7,
        "windupSimSeconds": 0.4,
        "grabBandMetres": grabBandMetres,
        "moves": [
          {
            "id": "bite",
            "weight": 1,
            "damage": 6,
            "damageKind": "pierce",
            "hitRegions": [{ "region": "leftLeg", "weight": 1 }, { "region": "rightLeg", "weight": 1 }]
          }
        ]
      },
      "dismember": { "chance": 0.05, "headOnKillChance": 0.15 },
      "downed": {
        "finishOff": { "simSeconds": 3 },
        "dismember": { "simSeconds": 15, "quality": "cutting", "level": 1 }
      },
      "abilities": ["grab"],
      "loot": "shambler_pockets"
    },
    {
      "id": "amalgam",
      "strength": 0,
      "name": "Amalgam",
      "model": "amalgam",
      "canJumpObstacles": false,
      "locomotion": "omnidirectional",
      "bodyScale": 4,
      "soundPitchMultiplier": 0.5,
      "spawnWeight": 1,
      "authoredOnly": true,
      "sounds": {
        "idle": "amalgam_idle",
        "alert": "amalgam_alert",
        "attack": "amalgam_attack",
        "hurt": "amalgam_hurt"
      },
      "regions": {
        "core.trunk": 2400,
        "member.head": 60,
        "member.torso": 60,
        "member.leftArm": 24,
        "member.rightArm": 24,
        "member.leftLeg": 24,
        "member.rightLeg": 24
      },
      "meleeDamageResistance": {
        "head": { "blunt": 0, "cut": 0, "pierce": 0 },
        "torso": { "blunt": 0, "cut": 0, "pierce": 0 },
        "leftArm": { "blunt": 0, "cut": 0, "pierce": 0 },
        "rightArm": { "blunt": 0, "cut": 0, "pierce": 0 },
        "leftLeg": { "blunt": 0, "cut": 0, "pierce": 0 },
        "rightLeg": { "blunt": 0, "cut": 0, "pierce": 0 }
      },
      "speed": {
        "wanderMetresPerSimSecond": 0.25,
        "chaseMetresPerSimSecond": 1.4,
        "backgroundStepMetres": backgroundStepMetres
      },
      "stepLength": 0.6,
      "sight": 25,
      "nightSight": 10,
      "stimulusMemorySimSeconds": 180,
      "sightCone": 60,
      "eyeHeightMetres": senseHeightMetres,
      "earHeightMetres": senseHeightMetres,
      "hordeSpacing": hordeSpacing,
      "hearing": 1,
      "hearingRange": { "walk": 3, "jog": 8, "sprint": 15 },
      "hearingModel": {
        "farMultiplier": 2,
        "bearingErrorRadians": 0.61,
        "investigationDistanceMetres": 8,
        "searchSimSeconds": { "min": 40, "max": 50 },
        "searchRadiusMetres": 4,
        "searchStrollSimSeconds": { "min": 1, "max": 3 }
      },
      "wander": {
        "obstacleWanderChance": 0.25,
        "obstacleWanderDistanceMetres": 10,
        "wayAroundReachMetres": 2,
        "wayAroundMinGainFraction": 0.25,
        "idleSimSeconds": { "min": 3, "max": 10 },
        "strollSimSeconds": { "min": 3, "max": 12 },
        "leashMetres": 12,
        "lookIntervalSimSeconds": { "min": 0.8, "max": 1.8 },
        "bodyLookArcDegrees": 150,
        "headLookArcDegrees": 100,
        "bodyTurnDegreesPerSimSecond": 90,
        "headTurnDegreesPerSimSecond": 120,
        "movementAccelerationMetresPerSimSecondSquared": 4
      },
      "chaseMotion": {
        "swayDegrees": 0,
        "swayIntervalSimSeconds": { "min": 0.7, "max": 1.1 },
        "speedMultiplier": { "min": 1, "max": 1 },
        "lurchSimSeconds": 1,
        "stumbleChancePerSimSecond": 0,
        "stumbleDurationSimSeconds": { "min": 0.55, "max": 0.75 },
        "stumbleEaseSimSeconds": 0.2,
        "stumbleSpeedFraction": 0.04,
        "stumbleDecelerationMetresPerSimSecondSquared": 14
      },
      "attack": {
        "reach": 2.2,
        "cooldownSimSeconds": 2.8,
        "windupSimSeconds": 1,
        "moves": [
          {
            "id": "tentacle_strike",
            "weight": 1,
            "damage": 22,
            "damageKind": "blunt",
            "hitRegions": [
              { "region": "torso", "weight": 6 },
              { "region": "head", "weight": 2 },
              { "region": "leftArm", "weight": 1 },
              { "region": "rightArm", "weight": 1 }
            ]
          }
        ]
      },
      "carving": { "radiusMetresPerDamage": 0.0023, "maxRadiusMetres": 0.75, "interiorColor": "#7a1e22" },
      "dismember": { "chance": 0.15, "headOnKillChance": 0.25 },
      "abilities": [],
      "loot": "shambler_pockets"
    },
    // Placeholder shambler body until the m7 spitter model; `docs/acid-zombie.md` owns what the type must show.
    $.zombies[0] + {
      "id": "acid_zombie",
      "name": "Acid zombie",
      "authoredOnly": true,
      "acidResistance": 1,
      "abilities": ["acidSpit"],
      "acidSpit": {
        "rangeBand": { "nearMetres": 4, "farMetres": 12 },
        "windupSimSeconds": 1.2,
        "cooldownSimSeconds": 5,
        "cancelPenaltyFraction": 0.5,
        "spreadDegrees": 4,
        "globMetresPerSimSecond": 14,
        "globGravityMetresPerSimSecondSquared": 4,
        "presentation": {
          "color": "#8bff32",
          "radiusMetres": 0.08,
          "splashRadiusMetres": 0.3,
          "splashRealSeconds": 0.25
        },
        "moves": [
          {
            "id": "spit",
            "weight": 1,
            "damage": 6,
            "damageKind": "acid",
            "hitRegions": [
              { "region": "torso", "weight": 5 },
              { "region": "head", "weight": 2 },
              { "region": "leftArm", "weight": 1 },
              { "region": "rightArm", "weight": 1 }
            ]
          }
        ],
        "puddle": { "lifetimeSimSeconds": 8, "radiusMetres": 0.8, "damagePerSimSecond": 2 }
      }
    }
  ]
};
content + {
  zombies: [zombie + {
    severedItems: if zombie.model == 'amalgam' then { [region]: null for region in std.objectFields(zombie.regions) } else severedItems,
    hearingModel+: {
      loudNoiseRadiusMetres: 30,
      hesitationSimSeconds: { min: 5, max: 5 },
      refusalSuspicionSimSeconds: 20,
      refusalLean: 0.75,
      chainRadiusMetres: 8,
      chainChance: 0.35,
    },
    attack+: {
      moves: [move + { motion: meleeMotions[move.id] } for move in zombie.attack.moves],
    },
  } for zombie in content.zombies],
}
