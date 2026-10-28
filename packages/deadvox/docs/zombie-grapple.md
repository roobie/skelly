---
read_if:
  - you build or change how a zombie holds the player, or a move's `grapple` content
  - you add a hit response, a fall, a ladder or a knockback that should end a hold
  - you tune how a held player moves, turns or breaks free
  - you add a type that grabs, or a target other than the player
---

# Grapple

The crawler's whole promise is to grab your legs, and armed humanoids read as things that clutch (`DESIGN.md`, "Types are data"). A landed melee move only deals damage, so nothing a zombie does lasts past the hit. A grapple is a lasting record of who holds whom by which body region, started by a landed melee move and ended by a short, learnable list of exits. Every effect of being held is applied on the player's side by region, never by grabber type, so a new grabbing type is content and a new region is one more effect. See `src/core/zombies.ts`, `ZombieSystem`, and `src/core/schema.ts`, `ZombieMovesSchema`.

The code word is grapple. "Grab" already means the ladder grab, the pickup animation and the reach band (`src/core/zombies.ts`, `requiredGrabBand`), and "hold" already means tap-versus-hold on the use key, so either word in code would mislead. Player-facing text may still say "grabbed", because that is the word the character would use (`INTERFACE.md`, "Class 3: the character's voice").

## The rules

**A grapple rides on a melee move.** A move may carry an optional grapple block; a move without one is unchanged. The grapple starts when the move lands, so it reuses the wind-up, the reach test and the resolve that exist, and the only new code is the holding phase. Opting in per move in content keeps the ability explicit and validated, at the price of giving each type its move by hand; deriving it from the body later changes who authors the block, not its shape. The block enters the schema in the same PR as the code that reads it, because an ability the runtime cannot honour is a lie in content.

**The block names a target height, legs or chest.** The height sets where the reach line ends, so a crawler's line runs to the shins and a chest grapple needs the chest-to-chest line that melee uses now (`src/core/zombies.ts`, `grabOrigin`, `withinAttackReach`). The reach geometry then backs the region, which is more than a label: a crawler cannot grapple legs it cannot reach. The move's `hitRegions` still chooses where its damage lands, so a crawler can grapple the legs and bite an arm as two separate rolls.

**Strength is two numbers in content.** The block holds the slow fraction, the damage that breaks the grapple and its longest duration. There is no strength stat, and the brute is "stronger" only because its numbers are higher. A brute-only branch in code would break the moment a third grabber arrived.

**The session keeps a list of records.** Each record names the grabber, the target and the region. The list shape costs a little against a single field on the player, and buys multiple grabbers and non-player targets later without a reshape. The first slice only ever produces zombie-holds-player records.

**Every tick, each grapple re-checks its cause.** The grabber must be alive, the gripping arm must still work by the same rule that ends attacks (`src/core/zombies.ts`, `armDisabled`), the grabber must be in reach with a clear line, and the duration must not be exceeded. A grapple also ends on damage over its break threshold, on a stagger (`docs/stagger.md`, "The rules"), and on an impulse over a threshold. One release function owns every exit, so a hold can never outlive its cause, and nothing like a killed grabber or a severed arm needs its own release path. The impulse rule is the single rule brute knockback will meet when it lands (`EPIC.md`, "5. Holding ground").

**Effects are slow only, keyed by region.** Legs give a strong movement slow; the chest gives a weaker slow and slower turning. Both land where load and handling already scale pace (`src/game/player.ts`, `movementPace`) and where mouse look is scaled (`src/game/input.ts`, `lookSensitivity`). The player is never pinned: hands, stance, aim and every action stay free, so there is no lock to carve exceptions out of. This gives up the "buried under a horde" fantasy and, for the first slice, richer torso effects such as aim sway, slower swings, a locked arm or a drag toward the bite.

**Several grapples compound under a cap.** Each grapple's slow fraction compounds on the speed left over, and a global cap stops the product short of zero, so movement can never drop out and a horde death stays the player's fault. A short grace period after any release blocks new grapples, so a horde cannot re-grab in the same tick it lost its grip.

**Breaking free uses what the player already has.** The exits are kill the grabber, cut the arm, stagger it, push it with force, or outlast the duration. A short, learnable list beats one hidden number that makes breaking free feel random, and it needs no new input or tutorial. The first slice has no struggle input, so an empty-handed player can only outlast a grapple; whether that is real counterplay is open below.

**The start has a cue.** A camera tug toward the grabber and a sound mark the moment a grapple begins. Without it a leg grapple reads as lag, so the cue is part of the slice, not polish, and the slice carries visible camera behaviour that needs a look before it merges. The existing hit cue is the seam (`src/game/damageFeedback.ts`, `DamageFeedback`).

**It persists in saves.** Saving and loading must neither free a held player nor invent a hold, so the records travel with the game and are validated on load like the ladder grab (`src/core/saveFormat.ts`, `grabbedLadder`).

**Starting a ladder climb releases.** A climber's body is the ladder's, and a grapple that followed it up a ladder would fight the ladder owner for the body. The release is one more exit in the release function.

## Which types grapple

The roster is content values only: the crawler grapples the legs; shamblers grapple the chest; the brute grapples the chest with higher slow and break numbers; runners do not grapple. A type gains or loses grappling by adding or removing the block on its move.

## Tests

Tests cover release on the grabber's death, release on a severed arm, the save round-trip and that the cap holds under many grapples at once. They never pin tuning numbers, which belong to the playtest (`AGENTS.md`, "Tests").

## Open

- Whether the existing exits are real counterplay. Measure time-to-free with a melee weapon, a gun and empty hands; if the times are close, add a shove input in slice 2.
- Torso effects beyond slower turning, such as a drag toward the grabber or a locked arm, from slice 2 on.
- Non-player targets: zombies grappling other characters, or the player grappling or shoving a zombie. The record allows it; nothing produces it yet.
- A balance pass on crawler encounters and the gated slow scenarios once crawlers hinder movement.
- Whether a leg grapple also damages the legs. The player's body already has leg regions (`src/core/body.ts`, `BODY_REGIONS`), so this is a content choice on the move's `hitRegions`, not a body change.
