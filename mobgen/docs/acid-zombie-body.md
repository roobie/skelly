---
read_if:
  - you build or change the acid zombie's mobgen body, its template or its acid materials
  - you add a glowing material to a mobgen body, or drive an actor's glow from Deadvox
  - you build the body of a later tier of the acid evolution line
---

# Acid zombie body

The acid zombie is the first tier of the lab's acid evolution line and the first enemy that hurts the player from a distance. Its body exists so the player can pick a spitter out of a crowd at its range band before it spits, and can see the spit coming. Gameplay and the reasons for the spit are in `deadvox/docs/acid-zombie.md`; this doc covers only how the body serves them.

## Its own body, shared skeleton

The body is built from the ground up: its own template, builder, params and features, not a shambler with new colours. A recoloured shambler would read as a shambler at range, which defeats the silhouette rule above.

It reuses the humanoid bone set and topology, and nothing about the humanoid's look. Deadvox's hit regions, severing, crowd mask packing, gait poses, attack poses and gaze all key on those bone names, so a shared skeleton lets the spitter take hits, lose limbs, walk and look at the player through the paths every humanoid already uses. A skeleton of its own would fork each of those paths for a body that moves and breaks like a human. See `src/mob/humanoid.ts`, `src/mob/shamblerFigure.ts`, `REGION_BONES`, `src/mob/crowd.ts`, `packSeveredMask`, `src/mob/lookAtProfiles.ts`, `LOOK_AT_PROFILES`, and `deadvox/src/core/zombiePose.ts`.

## Silhouette

The frame is bulky and hunched: broad, heavy shoulders and chest, a forward-thrust head, so the outline differs from the shambler's at the distance it spits from. The swollen sac makes the chest bulge forward, which also separates it from the brute, whose bulk is height and breadth. Mass is a template choice (`PROJECT.md`, "Design boundaries"), so the spitter's weight follows its bulk, not voxel density.

## Parts

- **Chest sac.** A swollen acid sac in the chest, owned by the chest bone. It is the body's signature and its wind-up telegraph, so it sits on the front of the torso where a player facing the spitter sees it.
- **Eyes.** Glowing green eyes in the sockets, so the face reads as a spitter when the sac is turned away or hidden by the crowd.
- **Drool.** Acid hanging from the mouth, owned by the jaw, so it goes with the head when the head is severed. Mesh drool is static; the drips that fall from it are Deadvox presentation, because mesh voxels cannot fall without a simulation of their own.
- **Clothes.** A dark ragged shirt and trousers.

## Materials and colour

The acid parts need materials the body does not have: the fixed material list has no acid and nothing that glows. The acid colour is green against sickly skin and dark clothes; acid is the one bright colour on the body, so a player learns "green glow means spit". Colour values and their ranges are template params, so they stay authored content (`../PILLARS.md`, "Content forward compatibility"). Every added material must justify the mesh fragmentation it causes (`PROJECT.md`, "Design boundaries"). See `src/core/body.ts`, `MATERIALS`.

## Glow: what mobgen exports, what Deadvox drives

Mobgen says which materials glow; Deadvox says how brightly, per actor and per frame. The body is generated once per model and seed and shared by every actor of that variant, while the wind-up is simulation state of one actor, so the brightness cannot live in the geometry. The per-actor level reaches the shader through the crowd data texture that already carries each actor's severed and bloodied state. See `src/mob/crowd.ts` and `deadvox/src/render/mobActors.ts`.

- The sac and eyes glow at idle, so the spitter is identifiable before it acts.
- The sac brightens with wind-up progress, so the brightness is the telegraph the player reads; the head pulls back as part of the same telegraph through the attack pose.
- Glow is presentation. It reads simulation state and never feeds it back, so saves and replays are unaffected (`deadvox/docs/acid-zombie.md`, "Saves and determinism").

## Reaching Deadvox

The body becomes a new `model` value for Deadvox zombie types, resolved through `consumableTemplate` like every spawned model, and the acid zombie type names it in content. The mouth is the origin of the spit's line-of-sight test, so the spit origin must come from the generated jaw, not a fixed offset, or a spit could leave from outside the visible mouth. See `src/core/template.ts`, `consumableTemplate`, `deadvox/src/core/schema.ts`, `ZombieSchema`, and `deadvox/docs/acid-zombie.md`, "The spit".
