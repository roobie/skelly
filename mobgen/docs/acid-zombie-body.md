---
read_if:
  - you build or change the acid zombie's mobgen body, its template or its acid materials
  - you add a glowing material to a mobgen body, or drive an actor's glow from Deadvox
  - you build the body of a later tier of the acid evolution line
---

# Acid zombie body

The acid zombie is the first tier of the lab's acid evolution line and the first enemy that hurts the player from a distance. Its body exists so the player can pick a spitter out of a crowd at its range band before it spits, and can see the spit coming. Gameplay and the reasons for the spit are in `deadvox/docs/acid-zombie.md`; this doc covers only how the body serves them.

## Its own body plan, shared skeleton

The acid zombie is its own body plan with its own registered builder, template, params and features, not a shambler with new colours. The point is a new and better design with more variance than the humanoid builder gives. See `src/core/generate.ts`, `registerBodyPlan`, and `src/core/template.ts`, `BodyPlan`.

It keeps the humanoid bone set and topology, and nothing of the humanoid's look. Deadvox's hit regions, severing, crowd mask packing, poses and gaze all key on those bone names, so a shared skeleton lets the spitter take hits, lose limbs, move and look at the player through the paths every humanoid already uses. Every consumer that dispatches on body plan or model must therefore treat it as humanoid-shaped. See `src/mob/humanoid.ts`, `src/mob/shamblerFigure.ts`, `REGION_BONES`, `src/mob/crowd.ts`, `packSeveredMask`, and `deadvox/src/core/zombiePose.ts`.

Mass fractions are the humanoid's. They cover only the severable parts, which the shared skeleton keeps unchanged, and the sac is cosmetic. See `src/mob/templates.ts`, `HUMANOID_MASS_FRACTIONS`.

## Silhouette and size

The frame is bulky and hunched, with a forward-thrust head and the sac bulging from the chest. It stands at shambler height with brute-like breadth, at the shambler's voxel size. Mass is a template choice (`PROJECT.md`, "Design boundaries"), so its weight follows its bulk, not voxel density.

## Gait and gaze

It has its own heavier gait and its own look-at profile. See `src/mob/lookAtProfiles.ts`, `LOOK_AT_PROFILES`.

## Parts

- **Chest sac.** A swollen acid sac on the front of the chest, owned by the chest bone. It is cosmetic only and part of the torso hit region; later tiers of the line may give the sac effects of their own. On death it bursts as a cosmetic effect only.
- **Eyes.** Glowing green eyes in the sockets.
- **Drool.** Acid hanging from the mouth, owned by the jaw, so it goes with the head when the head is severed. Mesh drool is static; the drips that fall from it are Deadvox presentation, because mesh voxels cannot fall without a simulation of their own.
- **Clothes.** A shirt and trousers, ragged, with shambler-like hue ranges kept dark.

## Materials and colour

The acid parts need materials the body does not have: the fixed material list has no acid and nothing that glows. Acid green against sickly skin and dark clothes makes the acid the body's bright colour. Colour values and ranges are template params, so they stay authored content (`../PILLARS.md`, "Content forward compatibility"). Every added material must justify the mesh fragmentation it causes (`PROJECT.md`, "Design boundaries"). See `src/core/body.ts`, `MATERIALS`.

## Glow: what mobgen exports, what Deadvox drives

Mobgen says which materials glow; Deadvox says how brightly, per actor and per frame. The body is generated once per model and seed and shared by every actor of that variant, while the wind-up belongs to one actor, so the brightness cannot live in the geometry. See `src/mob/crowd.ts` and `deadvox/src/render/mobActors.ts`.

- The eyes glow at a fixed level.
- The sac glows at idle and brightens with wind-up progress; the head pulls back in the same telegraph.
- Glow levels, the drips and the death burst are Deadvox type content, because tunables live in content (`../PILLARS.md`, "Content forward compatibility"). See `deadvox/src/core/schema.ts`, `acidEffects`.
- Glow is presentation. It reads simulation state and never feeds it back, so saves and replays are unaffected (`deadvox/docs/acid-zombie.md`, "Saves and determinism").

## Reaching Deadvox

The body becomes a new `model` value for Deadvox zombie types, resolved through `consumableTemplate` like every spawned model, and the acid zombie type names it in content. The mouth is the origin of the spit's line-of-sight test, so the spit origin comes from the generated jaw, not a fixed offset, or a spit could leave from outside the visible mouth. See `src/core/template.ts`, `consumableTemplate`, `deadvox/src/core/schema.ts`, `ZombieSchema`, `deadvox/src/core/zombieFigure.ts`, `humanoidMouthOrigin`, and `deadvox/docs/acid-zombie.md`, "The spit".
