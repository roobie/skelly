---
read_if:
  - you locate or change a schema contract cited here
  - you build or change how a zombie holds the player, or a move's `grapple` content
  - you add a hit response, a fall, a ladder or a knockback that should end a hold or throw the player
  - you tune how a held player moves, turns or breaks free
  - you add a type that grabs, or a target other than the player
---

# Grapple

The crawler's whole promise is to grab your legs, and armed humanoids read as things that clutch (`DESIGN.md`, "Types are data"). A landed melee move only deals damage, so nothing a zombie does lasts past the hit. A grapple is a lasting record of who holds whom by which body region, started by a landed melee move and ended by a short, learnable list of exits. Every effect of being held is applied on the player's side by region, never by grabber type, so a new grabbing type is content and a new region is one more effect. See `src/core/zombies.ts`, `ZombieSystem`, and `src/core/schema/zombies.ts`, `ZombieMovesSchema`.

The code word is grapple. "Grab" already means the ladder grab, the pickup animation and the reach band (`src/core/zombies.ts`, `requiredGrabBand`), and "hold" already means tap-versus-hold on the use key, so either word in code would mislead. Player-facing text may still say "grabbed", because that is the word the character would use (`INTERFACE.md`, "Class 3: the character's voice").

## The rules

**A grapple rides on a melee move.** A move may carry an optional grapple block; a move without one is unchanged. The grapple starts when the move lands, so it reuses the wind-up, the reach test and the resolve that exist, and the only new code is the holding phase. Opting in per move in content keeps the ability explicit and validated, at the price of giving each type its move by hand; deriving it from the body later changes who authors the block, not its shape. The block enters the schema in the same PR as the code that reads it, because an ability the runtime cannot honour is a lie in content.

**A full block denies the start; a partial block does not.** The guard already reports whether it absorbed a blow fully or in part (`src/core/meleeCombat.ts`, `meleeBlock`; `src/game/session.ts`, `blockedDamage`), and the move's resolve must learn that outcome before it starts the grapple. A clean parry throws the arms off, so nothing closes. A half-absorbed move still closes, because a guard that answered every grapple while stamina lasted would turn the crawler's threat into a stamina check. A winded guard absorbs nothing, so a winded player cannot deny a grapple.

**The block names a target height, legs or chest.** The height sets where the reach line ends, so a crawler's line runs to the shins and a chest grapple needs the chest-to-chest line that melee uses now (`src/core/zombies.ts`, `grabOrigin`, `withinAttackReach`). The reach geometry then backs the region, which is more than a label: a crawler cannot grapple legs it cannot reach. The move's `hitRegions` still chooses where its damage lands, so a crawler can grapple the legs and bite an arm as two separate rolls.

**Strength is two numbers in content.** The block holds the slow fraction, the damage that breaks the grapple and its longest duration. There is no strength stat, and the brute is "stronger" only because its numbers are higher. A brute-only branch in code would break the moment a third grabber arrived.

**The session keeps a list of records.** Each record names the grabber, the target and the region. The list shape costs a little against a single field on the player, and buys multiple grabbers and non-player targets later without a reshape. The first slice only ever produces zombie-holds-player records.

**Every tick, each grapple re-checks its cause.** The grabber must be alive, the gripping arm must still work by the same rule that ends attacks (`src/core/zombies.ts`, `armDisabled`), the grabber must be in reach with a clear line, and the duration must not be exceeded. A grapple also ends on damage over its break threshold, on a stagger (`docs/stagger.md`, "The rules"), and on an impulse over a threshold. One release function owns every exit, so a hold can never outlive its cause, and nothing like a killed grabber or a severed arm needs its own release path. The impulse rule is the single rule brute knockback will meet when it lands (`EPIC.md`, "5. Holding ground").

**Knockback on a held player throws.** When a knockback lands on a player a brute holds, the impulse rule releases the grapple and a throw impulse is added at release, so a held player flies farther than a free one. The throw is the first effect a zombie's grapple has beyond the slow, and it is allowed because it lands at release, not while held: nothing a held player does changes, and the only grapple-side cost is that knockback reads the record list. Throw strength is a number on the brute's content, not a brute branch in code, so a second throwing type is content (`PILLARS.md`, "Content forward compatibility"). The throw belongs to the knockback work, which has no code yet, and not to the first grapple slice.

**Effects are slow only, keyed by region.** Region effects are slows. Legs give a strong movement slow; the chest gives a weaker slow and slower turning. Both land where load and handling already scale pace (`src/game/player.ts`, `movementPace`) and where mouse look is scaled (`src/game/input.ts`, `lookSensitivity`). The player is never pinned: hands, movement and most actions stay free, and the few refusals a grapple adds are listed under "While held" so no other code need ask whether the player is held. The brute's throw is the one effect outside the slow, and it lands at release, above. This gives up the "buried under a horde" fantasy and, for the first slice, richer torso effects such as aim sway, slower swings, a locked arm or a drag toward the bite.

**Several grapples compound under a cap.** Each grapple's slow fraction compounds on the speed left over, and a global cap stops the product short of zero, so movement can never drop out and a horde death stays the player's fault. A short grace period after any release blocks new grapples, so a horde cannot re-grab in the same tick it lost its grip.

**Breaking free uses what the player already has.** The exits are kill the grabber, cut the arm, stagger it, push it with force, or outlast the duration. A short, learnable list beats one hidden number that makes breaking free feel random, and it needs no new input or tutorial. The first slice has no struggle input, so an empty-handed player can only outlast a grapple; whether that is real counterplay is open below.

**The start has a cue.** A camera tug toward the grabber and a sound mark the moment a grapple begins. Without it a leg grapple reads as lag, so the cue is part of the slice, not polish, and the slice carries visible camera behaviour that needs a look before it merges. The existing hit cue is the seam (`src/game/damageFeedback.ts`, `DamageFeedback`).

**It persists in saves.** Saving and loading must neither free a held player nor invent a hold, so the records travel with the game and are validated on load like the ladder grab (`src/core/saveFormat.ts`, `grabbedLadder`).

**Starting a ladder climb releases.** Grabbing a ladder moves the body onto the rails, the same kind of displacement as a fall or a knockback, so it releases like an impulse does. The release is one more exit in the release function.

**A climber can be grappled.** A grapple that lands on a player already on a ladder holds, and its slow lands on the climb. The pace factor that slows walking does not reach a climb on its own: the climb normalizes the steered velocity before it applies the ladder's own climb speed, and that speed arrives from ladder content with no pace on it (`src/core/ladders.ts`, `climb`; `src/game/session.ts`, `advancePlayerBody`), so a slow on the steered velocity cancels out. The implementing slice therefore carries the grapple slow into the climb speed as a second seam beside the walking pace. The ladder needs no new reach condition. A ladder is not a safe perch: a shambler at the ladder foot slows the climb, and climbing on until out of reach breaks the grapple through the per-tick line check, so release comes free too. Pulling a climber off the ladder is a non-slow effect and stays out of the first slice. The reach line to a climber above the grabber is a geometry case the chest-to-chest line may not cover cleanly; it is open below for the implementing slice.

## While held

Being held is a slow, so the player keeps acting. The rules below are the whole list of what a grapple start stops or a held player is refused; everything else stays as it is for a free player.

**A grapple start interrupts like a hit.** The start emits the same interrupt event a wound emits, so a long action stops under its own job's rule (`src/core/sim.ts`, `Simulation.checkInterruptions`; `DESIGN.md`, "Long actions") and a bear-trap disarm is interrupted the way a hit interrupts it (`src/game/bearTrapActions.ts`, `interruptDisarm`). Reusing the event means a zero-damage grapple still interrupts without a second interruption path, and every job that learns to handle hits handles grapples for free.

**Carried items stay in hand.** A grapple costs the player nothing they hold, so a held player can still swing, shoot or use what they carried. A grabber that takes the wielded item is a different enemy, open below.

**Lifted furniture drops at the start, even where placement refuses.** A piece the player lifted drops where they stand (`src/core/furnitureMove.ts`, `liftFurniture`). If placement refuses the spot, the piece drops anyway. The bypass is a known hole: placement guards reach, floor, room and landing, so a forced drop can leave a piece stuck or clipped, and every later placement fix must remember that this path skips it. A pending push job is cancelled at the start as well, because a push that finished would move the piece where the held player can no longer follow (`src/game/session.ts`, `furniture.slide`). A held player who lifts a piece again may set it down; setting down is not refused.

**Sights, breath hold and stance changes are refused.** A held player fires from the hip: aiming down sights and holding breath are refused (`src/game/session.ts`, `breathHoldWanted`), and so is every stance change, crouching, going prone or standing (`src/game/player.ts`, `nextStance`). These are the only non-slow effects in the first slice. The refusal cue is player-only, like other bodily refusals (`INTERFACE.md`, "Bodily cues").

## Which types grapple

The roster is content values only: the crawler grapples the legs; shamblers grapple the chest; the brute grapples the chest with higher slow and break numbers; runners do not grapple. A type gains or loses grappling by adding or removing the block on its move.

## Tests

Tests cover release on the grabber's death, release on a severed arm, the save round-trip and that the cap holds under many grapples at once. They never pin tuning numbers, which belong to the playtest (`AGENTS.md`, "Tests").

## Open

- Whether the existing exits are real counterplay. Measure time-to-free with a melee weapon, a gun and empty hands; if the times are close, add a shove input in slice 2.
- Torso effects beyond slower turning, such as a drag toward the grabber or a locked arm, from slice 2 on.
- Non-player targets: zombies grappling other characters, or the player grappling or shoving a zombie. The record allows it; nothing produces it yet.
- A balance pass on crawler encounters and the gated slow scenarios once crawlers hinder movement.
- Whether the reach line reaches a climber above the grabber. The chest line is built for two standing bodies (`src/core/zombies.ts`, `withinAttackReach`), so the implementing slice must check that a grabber at the ladder foot can start and keep a grapple on a climber, and what height ends it.
- Whether carried items survive a grapple, if an enemy that grabs the wielded item is added. Until then they stay in hand.
- Whether a leg grapple also damages the legs. The player's body already has leg regions (`src/core/body.ts`, `BODY_REGIONS`), so this is a content choice on the move's `hitRegions`, not a body change.
