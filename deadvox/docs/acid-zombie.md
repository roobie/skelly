---
read_if:
  - you build the acid zombie or the `acidSpit` ability
  - you add a ranged zombie attack, a zombie projectile or acid damage
  - you decide how the player counters an enemy that attacks from a distance
---

# Acid zombie

The acid zombie is the first enemy that hurts the player from a distance. Every earlier type closes to melee, so the player's answer has always been the same: keep distance, or meet it with a weapon. A spitter makes standing in the open a cost. It turns cover, line of sight and timing into choices, and it rewards closing in at the right moment instead of always backing off.

The open questions below are BR's. Build nothing that depends on an open question until BR answers it. Everything else here follows from rulings already in `DESIGN.md` and is cited.

## Ability, not type

`acidSpit` is a general ability component, not acid-zombie code. Any type that lists it in `abilities` spits, and its tunables live in that type's content: range band, wind-up, cooldown, spread, hit moves and, depending on Q1, projectile speed. A later type such as a lab boss or a hazmat variant reuses it by data alone. Validation rejects a type that lists `acidSpit` without its tunables, and tunables on a type that doesn't list it. See `DESIGN.md`, "Types are data"; `PILLARS.md`, "Content forward compatibility"; and `src/core/schema.ts`, `ZombieSchema` and `ZOMBIE_ABILITIES`.

The spitter still has an ordinary `attack` for when the player reaches it. A spitter with no melee would make closing in risk-free, and the counter would collapse into "run up and hit it".

## The spit

**Telegraph before damage.** The spit has a wind-up the player can see and hear, like the amalgam's tentacle and every melee swing: the head pulls back, the throat swells and a wet sound plays from the zombie's position. Without a telegraph, a ranged hit reads as random damage from off-screen. The wind-up sound is the type's attack sound. See `DESIGN.md`, "Amalgam body and damage", and `src/core/schema.ts`, `ZombieSchema`.

**Sight, not hearing, starts a spit.** A zombie spits only at a player it sees, from inside its range band and sight cone. Heard or remembered stimuli move it, as they move any zombie, but they never aim a spit, so breaking sight always stops the next one. See `src/core/zombies.ts`, `seesPlayer`.

**Line of sight is checked at release.** The path from the mouth to the player's chest is tested against solids when the spit leaves. If something solid is in the way, there is no spit; the zombie keeps its cooldown and moves again. Ducking behind a wall during the wind-up is the main counter, and it must work. The amalgam's tentacle and the grenade use the same rule. See `src/core/zombies.ts`, `withinAttackReach`, and `src/core/explosive.ts`, `inSight`.

**Aim is seeded.** The spit aims where the player is at release, with a seeded spread from content, so replays and saves agree and a far spit can miss. See `DESIGN.md`, "Determinism".

**Bodies block it.** A zombie body in the path stops the spit, as it stops pellets and fragments. A crowd shields the player from a spitter behind it. Whether the blocking zombie takes acid damage is part of Q3. See `src/core/zombies.ts`, `ZombieSystem.firePellets`.

**The player is hit through the existing path.** A spit that lands is one localized hit on a region picked by the move's weighted `hitRegions`. Pain, shock, bleeding, worn-item wear and saves therefore keep their single owners, as landing injuries do. See `DESIGN.md`, "Landing injuries", and `DESIGN.md`, "Bleeding"; `src/core/zombies.ts`, `pickZombieHitRegion`; and `src/core/sim.ts`, `Simulation.hit`.

**Acid is a damage kind.** `DAMAGE_KINDS` holds only melee kinds. Acid joins them, so bleeding chance, wound depth, pain and shock per kind are authored for acid in content, not special-cased in code. The aim is a burn: content gives acid a low bleeding chance and high pain. Adding the kind also gives Hazmat's "resists acid" a key to resist. See `src/core/body.ts`, `DAMAGE_KINDS`, and `src/core/schema.ts`, `perDamageKind`.

## Movement

The spitter keeps a shambler's senses, attention and modes. On sight, it moves until the player is inside its range band, stops, faces the player and winds up. During cooldown it does what Q4 decides. There is no route planning, so a zombie that "keeps distance" can only beeline away, which costs it walls and corners; this is why Q4 includes options that never retreat. See `DESIGN.md`, "Senses and AI".

## Player counters

These must all work, because each is the reason the fight reads as more than trading damage:

- **Break line of sight** during the wind-up: corners, doorways, furniture, a parked car.
- **Close during the cooldown,** when it cannot spit again.
- **Kill it from beyond its range band** with a firearm. Its reach is a range band, not unlimited.
- **Use the crowd:** shamblers between you and it block the spit.
- **Crouch behind low cover,** if the cover blocks the mouth-to-chest line, because crouching lowers the chest.

Whether a hit during the wind-up cancels the spit is part of Q2.

## Saves and determinism

Wind-up progress, cooldown and the aim seed are simulation state, saved and replayed like the melee attack's. If Q1 picks a simulated projectile, or Q3 picks a lingering puddle, each glob and puddle is saved simulation state too. Its look (trail, splash, hiss) is presentation only, like gore. See `DESIGN.md`, "Damage, destruction and dismemberment".

## Model

The silhouette must read as a spitter at its range band before it spits: a swollen throat and jaw, and a pose that leans the head forward. Players should learn to pick it out of a crowd and prioritize it. The wind-up pose needs to be readable at that distance, not only up close. Q6 decides whether that is a new mobgen template or a shambler with an authored palette and pose. See `mobgen/PROJECT.md` and `src/core/schema.ts`, `ZombieSchema`, `model`.

Player-visible text follows `INTERFACE.md`, "Text": the type's name is a label, and the burn shows through bodily cues and the body panel, never as narration.

## Open questions for BR

**Q1. How does the spit travel?** Thrown items have no in-flight simulation (`DESIGN.md`, "Held-item throws"), so every option except C adds something new.

- **A. Simulated glob.** A visible blob flies on an arc, saved as sim state, and hits whatever it meets first. It can be dodged by moving sideways, and it reads best. This is the most work: a new projectile owner, its saves and its collision.
- **B. Delayed hit.** The line check and target are fixed at release, and damage lands after a travel delay while a render-only glob flies. It is cheaper and deterministic. Moving after release doesn't dodge, though breaking sight before release still does.
- **C. Instant line hit.** Like a pellet: release equals impact. It is the cheapest, but the wind-up is the only warning, so it feels like a gun.

**Q2. Difficulty and feel.**

- **A. Harassment:** one spit hurts but rarely opens a serious wound, the cooldown is long, and a hit during the wind-up cancels it. The spitter is mostly a positioning problem.
- **B. Threat:** two or three unanswered spits put a healthy player in danger, and the wind-up can't be interrupted. You must break sight or kill it.
- **C. Priority target:** a spit can disable a region (an arm's aim sway, a leg's pace) through pain. It is dangerous in a crowd and must die first.

**Q3. What does acid damage?**

- **A. Body only.** Worn items take the usual per-hit wear (`src/core/wear.ts`, `wearOnPlayerHit`). This needs no new rule.
- **B. Body and the outer worn layer,** with acid wearing it harder than melee. Armour and clothes become a consumable against spitters. This needs per-kind wear in content.
- **C. Also held or carried items:** a spit to the arm can ruin the held weapon's condition. It is the scariest option, and losing a gun to a spit is a strong, possibly unfair, feeling.
- **Add-on: other zombies.** Do bodies that block a spit take acid damage? Yes makes "use the crowd" also "turn it on them".

**Q4. What does it do between spits?**

- **A. Hold and spit:** it stays put in its band and spits each cooldown, closing only if it loses sight. This is the simplest, and it gives the player a stationary target.
- **B. Close in:** it spits on the approach, then melees like a shambler. This is the most familiar, and it is a ranged opener rather than a ranged unit.
- **C. Keep distance:** it backs off when the player closes inside the band. This is the most "ranged-enemy" feel, but with no route planning it beelines backwards into walls. That reads as dumb until navigation exists.

**Q5. Lingering acid in the world.**

- **A. None:** a spit only hits or misses.
- **B. Puddle:** a missed spit leaves a short-lived pool that burns legs on contact. Ground becomes terrain to read, and it is new saved state.
- **C. Corrosion:** it marks or weakens blocks. It ties into destruction but is far out of scope for the first ranged enemy.

**Q6. Tier, spawn and model.**

- **A. Tier 1, ordinary spawns:** a low `spawnWeight` in hamlets and on markers, so players meet ranged pressure early. It uses a shambler template with its own palette and pose.
- **B. Tier 2, lab sites only:** `authoredOnly` at lab markers, beside Hazmat. Acid stays a lab threat, as "Evolution" already places weird types near labs. It is rarely met until labs exist in play.
- **C. Tier 1 now, with a lab evolution later:** as A, plus a later evolution path near labs (`DESIGN.md`, "Evolution"). A new mobgen template comes when it evolves.
