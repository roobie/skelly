---
read_if:
  - you change how holding the attack builds, releases or drops a melee charge
  - you tune a weapon's `charge` content or the stamina a charge costs
  - you add a hands action, hit or control loss that must interrupt a charge
  - you answer one of the open charged-attack questions (#276)
---

# Charged attacks

Slice 5 admits charged attacks so committing to a strike has a place in defence (`SLICE-5.md`, "Related issues and admission"). A charged strike is the one that staggers a shambler ([stagger](stagger.md)), so the charge's cost and its interruptions are what keep stagger a reward rather than a habit. See `src/core/playerCombat.ts`, `PlayerCombat`, `holdCharge`.

## The rules

**A tap stays the ordinary strike.** Only holding the attack past the wind-up charges, so existing play and every weapon's ordinary tuning are unchanged, and player breach keeps its ordinary strikes (`SLICE-5.md`, "Settled breach rules — decision items #273 and #800"). Charging uses the same control as the strike because it is the same strike committed to, not a second attack to learn.

**The swing holds at the pulled-back pose.** The charge builds only while the swing waits there, and release resumes the swing's own timing, so the strike reaches contact as late after release as an ordinary swing does after its pull. The held pose is what tells the player, and anything watching, that a heavy strike is coming. See `src/core/meleePose.ts`, `meleePullEnd`.

**The build-up, its cap and its cost are the weapon's content.** Weapons differ in how they reward commitment, and modders tune them per weapon in the `melee` block. The cap means holding longer stops paying. A charge scales impulse as well as damage, because force is what staggers; validation requires every melee weapon to carry an impulse, so a charge always has one to scale. See `src/core/schema.ts`, `MeleeChargeSchema`, and `src/content/base/items-tools.libsonnet`, `melee`.

**Stamina is paid on release, and a short purse caps the strike.** A charge that is dropped costs nothing beyond the swing it started from. A release the player cannot fully pay for still strikes, only at the level paid: refusing the release would throw away an attack the player committed to. See `src/core/playerCombat.ts`, `releaseCharge`, and `src/game/session.ts`, `createSession`.

**Holding is not recovery.** The wait before the next swing is frozen while the charge is held. Otherwise a long hold would pay off the cooldown and the release would be followed at once by a free swing.

**The strike lands where the player looks at release.** Holding is how the player waits for a zombie to step into reach, so the aim follows the view until release.

**Only the dominant hand's weapon charges.** The hold control is the dominant hand's use; off-hand and fist alternation keep their ordinary swings, and a weapon without `charge` content never charges.

**An interruption drops the charge without a strike.** A hit taken, a change of held items, an off-hand use, a hands action such as handling, throwing or a ladder grip, and losing control all drop it. Releasing on interruption would turn every interruption into a free hit and make the charge safer than a tap. See `src/core/playerCombat.ts`, `cancelCharge`, and `src/game/session.ts`, `createSession`.

**A save mid-charge restores the same charge.** The held time is part of the melee action's snapshot, so loading neither drops the commitment nor releases it as a free strike. See `src/core/saveFormat.ts`.

## Open questions

These stay open for BR under #276. Each says how it is built until then; the options are alternatives, not recommendations.

- **Movement while charging.** Built as: full movement. Options: full movement; a content slow while held; no sprint while held. A slow makes the commitment visible in footwork; full movement keeps the charge a pure timing choice.
- **Ready stance.** Built as: charging needs no stance. Options: any swing can charge; only a swing from the ready stance charges. Requiring the stance ties charging to blocking and costs a second control.
- **Hold pose.** Built as: the pulled-back pose. Options: the pulled-back pose; just before contact. Holding before contact shortens the release-to-hit time and makes a charge harder to read.
- **Fists.** Built as: fists carry no `charge` content. Options: no fist charge; a fist charge on the dominant fist. A fist charge would let an unarmed player stagger.
- **Off-hand weapons.** Built as: only the dominant hand charges. Options: dominant only; either hand, each with its own hold. Off-hand charging needs its own hold control.
- **Which hits drop a charge.** Built as: zombie melee and acid hits. Options: zombie hits only; any damage, including falls and blasts. Wider dropping punishes charging near hazards.
- **When stamina is paid.** Built as: on release. Options: on release; drained over the hold. A drain makes a long hold cost even when dropped.
- **A raised block.** Built as: a block leaves the charge held. Options: a block keeps it; a block drops it. Keeping it lets a player hold a strike behind a guard.
- **Holding past full.** Built as: the charge holds indefinitely at the cap. Options: hold indefinitely; tire and decay after the cap; release automatically at the cap. An indefinite hold lets a player camp a doorway at full charge.
- **Recovery after a drop.** Built as: the frozen wait resumes. Options: resume the frozen wait; clear it; add the full cooldown. Clearing it makes a hit taken mid-charge a free reset.
- **Losing control.** Built as: losing control drops the charge. Options: drop; release. A release on, say, opening a menu would strike unseen.
- **Ranged hits.** Built as: only melee staggers. Options: melee only; thrown items over the threshold; projectiles and blasts too. Ranged stagger would let a firearm hold a zombie at a distance, which melee commitment pays for up close.
- **Stagger or knockdown.** Built as: stagger only, with knockdown left out. Options: stagger only; a knockdown above a second threshold. Knockdown adds a body state on the ground that saves and the horizon must carry.
