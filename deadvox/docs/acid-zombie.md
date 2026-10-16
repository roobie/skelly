---
read_if:
  - you build the acid zombie, the `acidSpit` ability, its glob or its puddle
  - you add a ranged zombie attack, a zombie projectile or acid damage
  - you add a later tier of the acid evolution line
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

**The glob is simulated.** The spit leaves as a glob that flies on an arc at a speed from content and hits the first thing it meets: a solid, a zombie body or the player. The player can sidestep a glob in flight, which makes the spit read as a thing in the world and gives a second chance after the wind-up. Thrown items have no in-flight simulation (`DESIGN.md`, "Held-item throws"), so the glob is a new owner of in-flight state, with its own collision.

**Aim is seeded.** The glob aims where the player is at release, with a seeded spread from content, so replays and saves agree and a far spit can miss. See `DESIGN.md`, "Determinism".

**A zombie in the way takes the acid.** A body the glob meets stops it, as it stops pellets and fragments, and that zombie takes the burn unless its type is immune to acid. Acid zombies are immune; shamblers are not. A crowd therefore shields the player and takes the acid, so "use the crowd" stays a tactic. Immunity is a per-type resistance to the acid kind in content, beside the existing per-region melee resistance, not a check on the acid zombie, so later tiers and other types choose it by data. See `src/core/zombies.ts`, `ZombieSystem.firePellets`, and `src/core/schema.ts`, `ZombieSchema`, `meleeDamageResistance`.

**The player is hit through the existing path.** A glob that lands is one localized hit on a region picked by the move's weighted `hitRegions`. Pain, shock, bleeding, worn-item wear and saves therefore keep their single owners, as landing injuries do. Hits are light and the cooldown long, so one spit hurts but rarely opens a serious wound. See `DESIGN.md`, "Landing injuries", and `DESIGN.md`, "Bleeding"; `src/core/zombies.ts`, `pickZombieHitRegion`; and `src/core/sim.ts`, `Simulation.hit`.

**Acid is a damage kind.** Acid sits beside the melee kinds, not among them: weapons, melee classes and per-region melee resistance take only melee kinds, while zombie attack moves, injury and wear content take every kind. So bleeding chance, wound depth, pain and shock are authored for acid in content, not special-cased in code. The aim is a burn: content gives acid a low bleeding chance and high pain. Hazmat's "resists acid" gets a key to resist. See `src/core/body.ts`, `MELEE_DAMAGE_KINDS` and `DAMAGE_KINDS`.

**Acid eats the outer worn layer.** A hit wears the outermost worn item on the struck region harder than melee does, so clothing and armour become a consumable against spitters and a reason to carry spares. Worn armour takes wear but doesn't change damage (`DESIGN.md`, "Bleeding"), so this costs gear, not health. The multiplier is per damage kind in content, not an acid check in the wear code. See `src/core/wear.ts`, `wearOnPlayerHit`.

## Puddles

A glob that hits the ground leaves a short-lived puddle that burns the legs of anyone standing in it. Ground becomes terrain to read, and a missed spit still denies space. Its lifetime, size and burn rate are content. Acid immunity covers puddles too, so a spitter can stand in its own acid. A puddle is simulation state, not a decal.

## Movement

The spitter keeps a shambler's senses, attention and modes. On sight, it moves until the player is inside its range band, stops, faces the player and spits each cooldown. It holds its ground between spits, moving again only when it loses sight or the player moves beyond the band's far edge. Holding still is the simplest behaviour that works without route planning, and it gives the player a stationary target to flank or shoot. See `DESIGN.md`, "Senses and AI".

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

Acid zombies spawn only in labs, where `DESIGN.md`, "Evolution" puts weird types. Each lab storey holds as many acid zombies as its depth: one on the intake storey, two on research, and so on down. Lab threat is authored per storey as weighted marker rows, which gives chances, not counts, so the rule needs a fixed per-storey count in that content. See `src/content/base/gauntlet-lab-threat.libsonnet`, `rows`, and `src/content/base/gauntlet-lab.libsonnet`, `storeys`. The type is otherwise `authoredOnly`, so it never turns up in hamlets.

## Saves and determinism

Wind-up progress, cooldown, the aim seed, every glob in flight and every puddle are simulation state, saved and replayed like the melee attack's. Their look (trail, splash, hiss, steam) is presentation only, like gore. See `DESIGN.md`, "Damage, destruction and dismemberment".

## Model

The acid zombie gets its own mobgen body, built from the ground up, not a recoloured shambler. The silhouette must read as a spitter at its range band before it spits, so the player learns to pick it out of a crowd. It must show:

- a bulky, hunched frame;
- a swollen acid sac in the chest that glows green, and brightens during the wind-up;
- glowing green eyes;
- acid drooling from the mouth, with drips that fall to the ground.

The body is a mobgen design task for an opus designer and opus coder pair; it adds a `model` entry for the type. See `mobgen/docs/acid-zombie-body.md` and `src/core/schema.ts`, `ZombieSchema`, `model`.

Player-visible text follows `INTERFACE.md`, "Text": the type's name is a label, and the burn shows through bodily cues and the body panel, never as narration.
