---
read_if:
  - you build the acid zombie, the `acidSpit` ability, its glob or its puddle
  - you add a ranged zombie attack, a zombie projectile or acid damage
  - you add a later tier of the acid evolution line
  - you change how the acid zombie sounds, or scramble another type's voice
  - you decide how the player counters an enemy that attacks from a distance
---

# Acid zombie

The acid zombie is the first enemy that hurts the player from a distance. Every earlier type closes to melee, so the player's answer has always been the same: keep distance, or meet it with a weapon. A spitter makes standing in the open a cost. It turns cover, line of sight and timing into choices, and it rewards closing in at the right moment instead of always backing off.

It is the first tier of an evolution line of acid enemies, and the line lives in labs. This tier is a harassment enemy that teaches the player to read a ranged threat; the danger comes with the next tier, which builds on the same ability and damage kind. See `DESIGN.md`, "Evolution".

## Ability, not type

`acidSpit` is a general ability component, not acid-zombie code. Any type that lists it in `abilities` spits, and its tunables live in that type's content: range band, wind-up, cooldown, the cooldown fraction a cancel costs, spread, glob speed, hit moves and puddle. Later tiers of the line reuse it by data alone, with harder numbers. Validation rejects a type that lists `acidSpit` without its tunables, and tunables on a type that doesn't list it. See `DESIGN.md`, "Types are data"; `PILLARS.md`, "Content forward compatibility"; and `src/core/schema.ts`, `ZombieSchema` and `ZOMBIE_ABILITIES`.

The spitter still has an ordinary `attack` for when the player reaches it. A spitter with no melee would make closing in risk-free, and the counter would collapse into "run up and hit it".

## The spit

**Telegraph before damage.** The spit has a wind-up the player can see and hear, like the amalgam's tentacle and every melee swing: the head pulls back, the chest sac glows brighter and a wet sound plays from the zombie's position. Without a telegraph, a ranged hit reads as random damage from off-screen. The wind-up sound is the type's attack sound. See `DESIGN.md`, "Amalgam body and damage", and `src/core/schema.ts`, `ZombieSchema`.

**A hit during the wind-up cancels the spit.** A cancelled spit costs part of the cooldown, as a fraction in content, because that fraction decides how often a harassing spitter can fire while the player fights back. Cancelling makes fighting back an answer in itself, which suits an enemy meant to harass rather than to kill.

**Sight, not hearing, starts a spit.** A zombie spits only at a player it sees, from inside its range band and sight cone. Heard or remembered stimuli move it, as they move any zombie, but they never aim a spit, so breaking sight always stops the next one. See `src/core/zombies.ts`, `seesPlayer`.

**Line of sight is checked at release.** The path from the mouth to the player's chest is tested against solids when the spit leaves. If something solid is in the way, there is no spit and the cooldown is not spent. Ducking behind a wall during the wind-up is the main counter, and it must work. The amalgam's tentacle and the grenade use the same rule. See `src/core/zombies.ts`, `withinAttackReach`, and `src/core/explosive.ts`, `inSight`.

**The glob is simulated.** Flight gives the player a second chance after the wind-up: sidestepping matters because the spit is a thing in the world, not delayed unavoidable damage. See `src/core/acidGlob.ts`, `advanceAcidGlob`, and `src/core/zombies.ts`, `ZombieSystem.acidGlobContact`. Flight and splash appearance remain presentation only; see `src/render/acidEffects.ts`, `AcidEffects`.

**Aim is seeded.** A far spit can miss, but saving or replaying must not change its chance to land. Release captures the attack rather than following the player, so moving after release remains a counter. See `DESIGN.md`, "Determinism"; `src/core/zombies.ts`, `AcidSpitRelease` and `ZombieSystem.resolveAcidSpit`; and `src/core/acidGlob.ts`, `AcidGlobState`.

**A zombie in the way takes the acid.** A crowd shields the player and takes the burn, so "use the crowd" stays a tactic. Acid zombies are immune; shamblers are not. Content owns immunity so later tiers and other types choose it by data. See `src/core/zombies.ts`, `ZombieSystem.resolveAcidGlobImpact` and `acidDamageToZombie`, and `src/core/schema.ts`, `ZombieSchema`.

**The player is hit through the existing path.** The glob ignores the melee block, which stays a melee answer. Localized hits keep pain, shock, bleeding and worn-item wear with their existing owners rather than creating a second injury system. Hits are light and the cooldown long, so one spit hurts but rarely opens a serious wound. See `DESIGN.md`, "Landing injuries", and `DESIGN.md`, "Bleeding"; `src/game/zombiePlayerHit.ts`, `applyZombiePlayerHit`; and `src/core/sim.ts`, `Simulation.hit`.

**Acid is a damage kind.** Acid sits beside the melee kinds, not among them: weapons, melee classes and per-region melee resistance take only melee kinds, while zombie attack moves, injury and wear content take every kind. So bleeding chance, wound depth, pain and shock are authored for acid in content, not special-cased in code. The aim is a burn: content gives acid a low bleeding chance and high pain. Hazmat's "resists acid" gets a key to resist. See `src/core/body.ts`, `MELEE_DAMAGE_KINDS` and `DAMAGE_KINDS`.

**Acid eats the outer worn layer.** A hit wears the worn item it meets first on the struck region harder than melee does, so clothing and armour become a consumable against spitters and a reason to carry spares. Worn armour takes wear but doesn't change damage unless it is impervious to acid (`DESIGN.md`, "Worn coverage"), so this costs gear, not health. The multiplier is per damage kind in content, not an acid check in the wear code. See `src/core/wear.ts`, `wearOnPlayerHit`.

## Puddles

A missed spit still denies space, making ground terrain to read. Contact is not a series of blows: stepping the same burn more often must not multiply wounds, clothing loss or dismemberment. Player contact uses the shared exposure owner so injury, wear and action refusal stay consistent with other burns; zombie contact bypasses blow presentation and severing. A puddle meets footwear first, so boots impervious to acid let the player stand in one unharmed (`DESIGN.md`, "Worn coverage"). See `src/core/zombies.ts`, `ZombieSystem.tickAcidPuddles`, `ZombieSystem.burnZombieFeet` and `ZombieSystem.resolveRegionDamage`; `src/core/damageExposure.ts`, `DamageExposures`; and `src/core/acidPuddle.ts`, `feetInAcidPuddle`. Content owns the footprint and burn tuning; see `src/core/schema.ts`, `AcidSpitSchema`. The release strength and contact identity survive saves so loading cannot change the threat or restart its threshold draws; see `src/core/zombies.ts`, `ZombieSystemState`.

## Movement

The spitter keeps a shambler's senses, attention and modes. On sight, it moves until the player is inside its range band, stops, faces the player and spits each cooldown. Holding still is the simplest behaviour that works without route planning, and it gives the player a stationary target to flank or shoot. See `DESIGN.md`, "Senses and AI".

- **Inside the band** it holds its ground between spits.
- **Beyond the far edge, or out of sight,** it moves again.
- **Inside the near edge but outside melee reach,** it closes in to melee like a shambler until the player leaves that gap. Once the player is back in the band, it goes back to holding ground and spitting.
- **A spit and a melee wind-up never run together.** A winding-up spit blocks a melee wind-up from starting, and a melee wind-up blocks a spit from starting. A spit already winding up fires at whatever range, even point-blank, and melee waits until after it. Rushing a winding-up spitter is punished.

## Player counters

These must all work, because each is the reason the fight reads as more than trading damage:

- **Break line of sight** during the wind-up: corners, doorways, furniture, a parked car.
- **Hit it during the wind-up** to cancel the spit.
- **Sidestep the glob** in flight.
- **Close during the cooldown,** when it cannot spit again.
- **Kill it from beyond its range band** with a firearm. Its reach is a range band, not unlimited.
- **Use the crowd:** shamblers between you and it take the acid.
- **Crouch behind low cover,** if the cover blocks the mouth-to-chest line, because crouching lowers the chest.

## Spawning

Acid zombies spawn only in labs, where `DESIGN.md`, "Evolution" puts weird types. Each lab level holds as many acid zombies as its depth below the hatch, so the deepest level holds the most; places outside the lab's numbered depth, such as the sewer, hold none. Lab threat is authored per storey as weighted marker rows, which gives chances, not counts, so the acid zombies take fixed marker cells beside those rows. See `src/content/base/gauntlet-lab-threat.libsonnet`, `acidCounts`, and `src/content/base/gauntlet-lab.libsonnet`, `storeys`. The type is otherwise `authoredOnly`, so ordinary settlement selection cannot place it.

## Voice

The acid zombie must be recognisable by ear, so a player who hears it before seeing it knows to look for a spitter and a line of sight to break. It voices the shambler recordings like every zombie, so only the processing sets it apart. Pitch alone is easy to confuse with the runner or the crawler, so the timbre is scrambled as well, which no other type does.

The scramble is data on the type's own sound rows, and a zombie's voice sounds are content references rather than a code list, so a new or changed voice needs content only and the other types' voices stay untouched. See `PILLARS.md`, "Content forward compatibility"; `src/content/base/sounds.jsonnet`, `zombieVoices`; `src/core/schema.ts`, `SoundSchema` and `ZombieSchema`; and `src/game/audio.ts`, `connectSample`.

Hear it with the debug spawn action for acid zombies, or from the sounds page.

## Saves and determinism

A save must not erase an incoming threat or change its outcome. See `src/core/zombies.ts`, `ZombieSystemState`, and `src/core/saveFormat.ts`, `encodeSave` and `decodeSave`. Presentation never decides whether a hit landed; see `DESIGN.md`, "Damage, destruction and dismemberment".

## Model

The acid zombie gets its own mobgen body, built from the ground up, not a recoloured shambler. The silhouette must read as a spitter at its range band before it spits, so the player learns to pick it out of a crowd. It must show:

- a bulky, hunched frame;
- a swollen acid sac in the chest that glows green, and brightens during the wind-up;
- glowing green eyes;
- acid drooling from the mouth, with drips that fall to the ground.

The body is mobgen's `acid` model; its bone rules and how Deadvox consumes them are in `packages/mobgen/docs/acid-zombie-integration.md`. See `src/core/schema.ts`, `ZombieSchema` and `ZOMBIE_MODEL`.

The sac, eyes, drips and splash are presentation only, so no simulation outcome or save depends on them. Their tuning is the type's `acidBody` content, which validation requires exactly for the acid model; see `src/core/schema.ts`, `AcidBodySchema`. The sac and eyes glow through their material's emission, and the wind-up brightens only the sac through the crowd data texture. The nearest acid zombies also light their surroundings through item-light slots that lights leave free; see `src/render/lightPool.ts`, `acidGlows`. Drips fall from the drawn mouth, and on death the sac's voxels vanish as a splash thrown from the glow anchor; see `src/render/acidEffects.ts`, `AcidEffects`, and `src/render/mobActors.ts`, `onBurst`.

Player-visible text follows `INTERFACE.md`, "Text": the type's name is a label, and the burn shows through bodily cues and the body panel, never as narration.
