---
read_if:
  - you're planning or implementing a Slice 3 milestone
  - you're checking Slice 3 scope, saves, tests or BR approval gates
  - "you're tracking #308's playtest 1 apex enemy scope and design questions"
  - you're interpreting BR's camera-directed gaze ruling for zombie models
  - you're changing crawler gait, hit response or generation validation
  - you're preparing the end-of-slice playtest or its authored map
  - you're detailing the military site's armoury access and its noisy fallback
  - you're changing or measuring input-replay capture and playback
---

# Slice 3 — Flesh and noise

**Status:** draft, proposed by the lead (2026-10-05) from BR's milestone-by-milestone rulings. BR's process ruling was: “slice-3 : let's deal with each milestone / one per turn”.

## Goal

Put combat, bodily consequences, stealth and zombie attention in place for the first authored playtest at the end of this slice. Combat must feel visceral: “we should aim for a very visceral experience in dealing with enemies like shamblers. Bullets, casings and body parts flying all over the place. The player should feel satisfied when they deem it worth to spend their hard earned ammo” (BR, 2026-10-05 21:04).

The player should have to choose when to ready a weapon, spend ammunition, make noise, hide, use light, treat wounds and hold ground. The playtest asks whether those choices are readable, tense and satisfying, and whether listening changes how players move.

## Playtest questions

Use the playtest questions in [EPIC.md](EPIC.md), together with Slice 2's questions and observations. Slice 3 adds only these questions:

- Can testers read ready/unready, ADS and en-garde from the controls and held pose without a HUD mode indicator?
- Do weapon attachments and firearm handling make ammunition choices clear before a shot is fired?
- Can players tell which available treatment applies to a wound and its infection stage?

The first real playtest runs at the end of this slice, before Slice 4, on the authored map in [#181](https://github.com/roobie/skelly/issues/181). Observe inventory time, pocket choices, reactions to unseen sounds and interruptions, where players stall, and the moments that annoy or delight them. Follow EPIC's run instructions; confirm the proposed tester prompt with BR during 3.11, and do not teach the systems first. Recruit at least three testers, including someone new to both CDDA and DayZ. BR has one tester; two more remain to be found.

## Scope

### In

The eleven milestones are:

- 3.1 Ready stance and en-garde.
- 3.2 Firearms for real.
- 3.3 Melee depth.
- 3.4 Body model.
- 3.5 Noise and senses.
- 3.6 Light as a sense.
- 3.7 Modular weapons.
- 3.8 New zombie types.
- 3.9 Hordes and the background tier.
- 3.10 Input recording and replay.
- 3.11 Authored playtest map and playtest.

### Out

- Zombie bashing of doors or blocks: deferred by BR (#273).
- Heavy melee attacks, stagger and knockdown: deferred by BR (#276).
- Fractures: deferred by BR (#277).
- A smell trail: deferred by BR (#278).
- Screamer and bloater types: deferred by BR (#280). The runner and crawler are the first new types.
- Shared flow fields: dropped by BR in the 3.9 ruling. Background zombies use the beeline in big, cheap steps instead; d84 (#279) is the carried-in attention brain. The remaining route follow-up in #244 is obsolete under that direction.
- Legendary effects beyond vanity. BR's direction is “mostly vanity thing, but we might come up with something along the way” (2026-10-05 21:29).

Beat details in #181 are settled one turn at a time before their dependent map rounds. The approved schematic v2 is the basis for the medical-site pass. BR ruled on pharmacy access for d122-6, “to keep it simple, we'll go for 1:(b) , 2:front counter” (2026-10-07 11:13): use #309's existing key-or-crowbar door lock and put the pharmacy key in the front counter. The military site follows its own map round.

## How this slice runs

- The planning conversation with BR handles one milestone per turn; this does not serialize implementation. Work on milestones when their dependencies are met and their first-look gate, where required, has BR's direction.
- Visual work gets a rough first look before the full engineering round. The gates below name the required look and approval.
- A milestone that adds authoritative simulation state saves and fingerprints it. Save/load must preserve the behavior, not just the data shape. Schema changes follow the current save contract; no legacy path is required.
- Tests protect behavior and costly-to-rediscover contracts: combat rules, state ownership, save round trips, determinism, reachability and assigned budgets. Do not pin content counts, drifting tuning, exact layouts or seeded outcomes.
- Before code starts, check the Deadvox default suite against the applicable test-run budget and explain any overrun from its coverage and costs. Keep machine-specific timings out of tracked docs; split or reshape work rather than hiding a slow suite by raising a timeout.
- No flaky tests. Fix nondeterminism or disable the exact test from CI with an owner and issue; never retry until green or raise a timeout to hide a failure.
- Merge against current main without rewriting published history. Each milestone PR runs its relevant checks and CI.

## Milestones

### 3.0 Before code starts

Paperwork; no game code.

- Open a checklist issue linking each milestone, dependency, first-look gate, test proof and final playtest evidence.
- Check the default Deadvox suite against the applicable test-run budget. Record any overrun and its coverage-based cause before code work; keep host-specific timings out of this plan.
- Map each open question to the milestone it gates. Get BR's decision when that milestone starts; beats 4–6 remain assigned to 3.11, not a blocker for earlier work.
- Confirm the carried-in work: d84's beeline attention brain (#279); d83's 0–10 skill scale and legendary level plus #275's training tiers; and d80's recoil and d78's impact tracing for 3.2.

**Saves:** none.
**Tests:** none beyond the budget check and the checklist's links to milestone proofs.
**Done when:** the checklist is open, dependencies and look gates are visible, the default-run check is recorded without tracked host-specific timings, and every open question has an owner and a decision point before its dependent work starts.

### 3.1 Ready stance and en-garde

**BR, 2026-10-05, earlier answers in #267:**

> yeah, melee needs 'en-garde' on right-mouse-hold, which also enables blocking incoming melee (based on skill)
> own gait, but mainly it's simply a speed factor
> the UI must show unreadied vs readied
> unreadied does not have muzzle forward - rather downward
> 1a. yes S is required to actually block from en-garde

**Lead's question in #267, 2026-10-05 13:12:**

> 3. What does left click do with an unreadied firearm: nothing, or the nope?

**BR's answer:**

> nothing

**BR, 2026-10-05 20:52:**

> 1 & 2. suggestion: let's have a 'firearms combat' and a 'melee combat' skills. The FC affects stuff like duck walking, whereas MC affects blocking
> > aside: that which a skill affects is also trained by it
> 3. takes a moment, and gets better with skill
> 4. hip and sights -> ADS (aim down sights) should work for iron sights as well as optics

**BR, 2026-10-05 20:56, amendment:**

> amend: skill training comes in tiers / simply duck walking can train FC up to N, where N is pretty low, maybe even just 1 / hitting enemies with firearm fire while duck walking can train it to P, where P is higher than 1 / the above is a specific example, but in a general application is that skills are trained by doing stuff that they affect, but some activites are harder than others, and thus allow for attaining higher skill levels than simpler activities

**BR, 2026-10-05 21:00:**

> 3.1, 1. for now, yes, firearms combat is simply firearms renamed - but longer term, firerams combat is different from how well you shoot with e.g. a shotgun or something else. Ie. we will have skills for each main type of firearm, e.g. shotguns, rifles, smgs, pistols etc
> 3.1, 2. it works like this: press-and-hold right mouse -> readies the weapon (hip fire), while in this state a toggle button (default, mouse-3) toggles whether ADS or not

**BR, 2026-10-06 13:29, second look:**

> as for the 3.1 ADS : the AK shows only the front sight , so the camera needs adjustment backwards a slight bit - but also, I think the AK actually don't have a notch (it's a single pin too, what i can see - we need to fix this too)
>
> but then the AR scope ADS is not good at all - but i can't take a screenshot because the view resets when I pause during ADS

**BR, 2026-10-06 14:34, AK sights:**

> the sight's post is not on the actual/virtual cross hair
>
> the sides of the notch won't work - they must be much smaller - like a real AK notch - maybe 2 mm or so?

**BR, 2026-10-06 18:36, AK receiver:**

> the AK still had the rear sight on top of a post
> this is not how it should be - compare a standard AKM's rear sight
>
> i wanted the received as a whole lifted so that the bore in relation to the receiver goes down by a margin great enough for the rear sight to align with the front without being lifted on a pin

`gungen/src/gun/parts.ts`, `akRearSight`, uses a finer sight-only grain because the shared gun grid cannot represent a 2 mm notch. Since g41 the AK follows its golden AKM photo (gungen/PROJECT.md, "Version 2: mapped from the golden photo"): the receiver sits around the bore as on the AKM, and the rear-sight leaf stands on the receiver's sight block, on the sight line, without a post or a receiver lift. Its notch datum and the front-post aim line stay aligned.

**BR, 2026-10-06 13:32, AR scope:**

> the issue with the AR scope (I'm guessing scopes in general) is that the aperture is like 30px diameter whereas the tube fills the screen

**BR, 2026-10-06 13:57, on the optic window:**

> you should _mainly_ see through the optic
>
> but it is shown as if looking through a pipe

The optic window shows the 1× scene through a large ocular aperture; the pipe interior is hidden while ADS, with the ring framing the view. Its fill is derived from exported ocular geometry and a content tuning so later 3.7 magnification can use the same window. Keep the eye at the sight position BR accepted as “somewhat okay”; do not move the AR eye far from its 4dbc6e37 ADS placement. Iron sights follow a separate rule: the AK rear notch and front post must frame each other above the receiver cover, with the eye behind the leaf and the post tip at the screen-centre aim ray. Holding F2 for debug controls must preserve ready and ADS so F2+M can freeze that pose.

**BR's #275 answers (2026-10-06, verbatim):**

At 09:57, answering how crafting activity tiers should be set:

> choose: a. worked out from the required level (my recommendation);

At 09:57, answering whether reading should train skills:

> no, not now - we might open up this again for discussion

At 10:04, answering whether practice above an activity's tier is kept or dropped:

> dropped

At 13:35, answering the crafting tier offset and how crouch and ready movement combine (option c was “crouch pace × the ready fraction”):

> as for crafting: each recipe: its required level + 1
>
> (c) both stack

At 13:33, answering whether the ADS toggle should be rebindable now or fixed to mouse-3:

> 2. rebindable now

**In:** Rename the current `firearms` skill to firearms combat (FC) and add melee combat (MC). FC governs the ready gait and related handling; MC governs blocking. Every practice source supplies an activity tier, and only that activity's excess is dropped when the skill reaches its tier. The current activity-tier starting values in base content are proposals for first-look play, not BR rulings. Crafting derives its tier from the recipe's required level plus the single offset in the crafting skill's training entry, capped at ordinary expert level; validation rejects craftable content when that offset is missing. BR's 13:35 ruling set that offset to required level + 1. Reading trains nothing. Activities train the skills they affect, with harder activities able to train higher. Readying takes simulation time that improves with FC. The rebindable `stance.ready` action defaults to right mouse and readies a firearm for hip fire; its unreadied muzzle points down and its ready pose brings the muzzle forward, with no HUD mode indicator. While ready, the rebindable `aim.ads-toggle` action (middle-mouse default) switches ADS and accepts keyboard or pointer bindings without Ctrl/Cmd modifiers. ADS works with iron sights and optics. Optic ADS shows the scene through a content-sized ocular window rather than down a pipe; iron-sight ADS keeps the rear notch and front post visible together. Melee requires en-garde; blocking also requires backing off with S and succeeds according to MC, per #267. Crouch pace and the ready movement factor both stack.

**Saves:** Character skill levels and practice use the existing character snapshot and fingerprint (`src/core/character.ts`, `Character.awardPractice`); renaming a skill changes that saved mapping, and melee combat adds its own progression. Held ready, ADS and en-garde inputs are transient. Partial firearm raise progress stays with the saved firearm because it determines when that weapon can fire (`src/core/firearmState.ts`, `FirearmState`).
**Tests:** an unreadied firearm cannot fire and makes no refusal sound; a ready firearm can fire but never while sprinting; raising takes simulation time and improves monotonically with skill; ADS toggles while ready and works with iron sights and optics; en-garde plus S can block according to skill, while en-garde alone cannot; activities stop training at their tier and discard excess practice. Save/load preserves skill progression and active raise progress.
**Done when:** the ready and en-garde states are visible in the held pose, input rules behave as ruled, and skill training respects activity tiers.
**First look / BR approval:** ready and ADS, including iron-sight ADS, raised/unraised poses, an AK rear notch framing the front post, and an optic aperture that reads large and centred with the tube only framing it. The optic's magnification and blurred 1× surround remain in 3.7.

### 3.2 Firearms for real

**BR, 2026-10-05, d62-4 (#262), verbatim:**

> we should add a aiming variance based on movement, swing and recoil (this should show in game via a sway on the weapon)
> will: 1) mitigate the aim variance 2) quicken reload time 3) quicken rack time (shotgun)
> which we will expand to separate firearm archetypes later, like skill:smgs, skill:shotguns etc
> as for gun skill / i tried it at =12 / and equipped the assault rifle - too much dispersion/sway at full auto

The "=12" was on the skill scale before d83 (#274). BR's later ruling, "dispersion is not a skill issue, but control is", is in [DESIGN.md](DESIGN.md), "Firearms".

**BR, 2026-10-05 21:04:**

> 1. magazines are real, you load them one by one, like in dayz
> 2. AR and AK are only found in military loot sources
> 3. yes
> 4. ideally, yes
>
> we should aim for a very visceral experience in dealing with enemies like shamblers. Bullets, casings and body parts flying all over the place. The player should feel satisfied when they deem it worth to spend their hard earned ammo

**BR, 2026-10-05 21:06:**

> the designed playtest map ends in a miltiary area - we just haven't gotten that far

**BR, 2026-10-05 22:17, on spent casings:**

> they should be saved

**In:** Real magazines loaded round by round, ammunition and rifle damage by body region/calibre. AR and AK are loot only at the military site placed by 3.11. The existing firearms-combat skill's aim-variance, reload and rack effects carry forward; later, shooting proficiency splits by firearm archetype. A firearm shot's recoil is carried in from d80; d78's impact trace owns visible world impacts. Body marks are desired where practical. Spent casings and body-part consequences should make firing feel consequential, without making cosmetic impact marks authoritative damage.
**Saves:** Magazine contents and any new chamber/action state that determines the next shot are saved with their owning items. Spent casings are world state: save where they fall and preserve them through save/load (BR, 2026-10-05 22:17: “they should be saved”). Body damage is owned and saved by 3.4. BR ruled that impact marks and dust are presentation, not simulation damage or save state (see [DESIGN.md](DESIGN.md), “Shot impacts”).
**Tests:** loading and firing conserve rounds across magazine, chamber and weapon; a round resolves against the body region it actually intersects and uses firearm/calibre data; save/load preserves the next shot, ammunition and spent-casing positions; changing impact presentation does not change damage. The impact presentation builds on `src/game/firearmHandling.ts`, `FirearmMechanics.fire`, and `src/render/shotTrace.ts`, `traceShot`. Test military loot reachability through the authored site rather than pinning a loot count.
**Done when:** magazines can be loaded one round at a time, rifle ammunition and weapons come from the map's military source, shots damage the appropriate region, and save round trips preserve ammunition and spent casings.
**First look / BR approval:** firearm impacts, hit feedback, spent casings and body-mark treatment.

### 3.3 Melee depth

**BR, 2026-10-05 21:08:**

> q1: yes
> q2: likely yes, but defer
> q3: likely yes, but defer
> q4: when stamina=0 -> can't swing
>
> also, wrt stamina, when reaching 0, it should wait a couple of seconds before starting to regenerate - say 5 seconds

**In:** Blunt, edged and stabbing weapons behave differently. At zero stamina the player cannot swing; after stamina reaches zero, regeneration waits about five seconds. Infection consequences for melee wounds depend on 3.4. Heavy attacks and stagger/knockdown remain out of this milestone (#276).
**Saves:** Save the stamina-regeneration delay when it affects the post-load recovery schedule. Any already-supported active swing continues to use its existing saved action owner; add no second swing representation.
**Tests:** each weapon behavior class produces its distinct contact behavior; a player at zero stamina cannot start a swing; stamina does not regenerate until the simulation-time delay expires, including after save/load; wound infection follows 3.4's owner and is not duplicated here.
**Done when:** weapon types have distinct melee behavior, zero stamina prevents swings, and the recovery delay is deterministic and survives saves.

### 3.4 Body model

**BR, 2026-10-05 21:12:**

> 1. yes, damage by body part - each possibly incurring negative effects
> 2. yes, as in DayZ
> 3. wound infection - treated by antiseptics, or antibiotics when has gotten far enough
> 4. we will have fractures at some point, but let's defer them for now

**In:** Damage by body part with possible consequences; health, blood and shock as separate concerns; wounds bleed until treated; wound infection is treated early by antiseptics and later with antibiotics. This milestone owns the body state used by melee, firearm hits, runner/crawler contact and the infection portions of 3.3 and 3.8. Fractures stay deferred (#277).
**Saves:** Authoritative body-region damage, blood/shock state, bleeding and infection progression, plus any treatment progress that persists across interruption. Include it in the snapshot and simulation fingerprint.
**Tests:** damage affects the struck region and its associated consequences; bleeding consumes blood until treated; antiseptic and antibiotic treatment apply at the ruled stages; save/load preserves wounds, blood and infection progress without duplicating treatment. Assert behavior and ownership, not exact damage rates or anatomical tuning.
**Done when:** body damage has region-specific consequences, bleeding and infection can be treated, and their state survives a save round trip.

**Treatment targeting:** BR ruled on 2026-10-06 08:41: “yes, most urgent wound is pre selected”. This avoids applying a treatment to an arbitrary valid wound when interaction hints are hidden; see `src/game/itemActions.ts`, `defaultItemAction`, and `src/core/longAction.ts`, `beginTreatment` for the selected action and its saved target.

### 3.5 Noise and senses

**BR, 2026-10-05 21:14:**

> 1. yes
> 2. keep it real simple
> 3. defer

**In (d98):** C toggles crouch, which is slower, quieter and harder to see. Sight worsens at night and while the player crouches. BR (2026-10-06 11:28) ruled: “3. somewhat yes - if a half-wall blocks the light at that altitude, then yes, it occludes, but otherwise no - same reach”. A crouched player's lowered eye and held-light height let a half-wall block sight and light, while crouching alone does not shorten light reach in the open. BR (2026-10-06 12:25) approved sighting standing players from eye height (“good”); a wall a little over chest height can hide a crouched player without hiding a standing one. Noise and positional sound are muffled by walls under the approved rule below. Smell remains deferred (#278).

**Decision (d98, BR, 2026-10-06 10:12):** “wall muffling: Approve it as written”. Use the direct ray test shared with zombie sight (`src/core/zombies.ts`, `seesPlayer`): a closed door counts, while a doorway or window gap does not. Any solid on the ray applies one coarse hearing attenuation, not a penalty per intervening block. Keep positional sound at its source and muffle it with gain and a low-pass filter rather than making it seem farther away. Starting values belong to the base content pack's `senses` entry and `deadvox/src/core/schema.ts`, `SenseSchema`.

**Per-sound tuning (d98-2; BR, 2026-10-06 11:10–11:11):** BR asked, “3.5 sounds pretty  good but some sounds are harder to judge than others. How much effort is it to tune each event?” and chose option A: “ok. Let's go for option A for now”. An optional `wall` setting on `src/core/schema.ts`, `SoundSchema.wall`, lets each sound tune positional-audio gain and cutoff when occluded; otherwise the global wall step applies. Zombie hearing keeps its global attenuation. Shipped sounds have no overrides until BR chooses which events need them.

**Saves:** BR ruled “let's make crouch a toggle” (2026-10-06), so crouch belongs in the player snapshot and simulation fingerprint; it persists through menus and long actions. Noise pulses remain transient. Persistent zombie attention/investigation stays in the zombie snapshot; do not add a second owner.
**Tests:** crouching changes movement, hearing and sight in the ruled directions; its toggle survives an inactive long action and save/restore, and replay with the toggle is deterministic. A wall muffles hearing and positional audio consistently under the approved rule, with sound still attached to its source. `deadvox/test/zombies.test.ts`, `does not replay a live far vocal pulse after a searching zombie is restored`, proves the saved vocal-noise ID prevents a still-live far pulse from replaying with a new bearing; the restored search then matches uninterrupted simulation. The crouched-light tests in `deadvox/test/zombies.test.ts` distinguish open-ground lit visibility from half-wall occlusion for crouched players while preserving sight of standing players over that wall. Extend the existing noise and sight owners (`src/core/zombies.ts`, `hearingTier`, `hearVocalNoise`, `seesPlayer`) rather than creating parallel sensory state. Tuning belongs in `deadvox/src/content/base/senses.json`, validated by `deadvox/src/core/schema.ts`, `SenseSchema`.
**Done when:** crouch and night visibility affect detection, the crouch toggle survives save/restore, walls apply the approved simple muffling rule to noise and positional sound, and cover blocks light at crouched height.

### 3.6 Light as a sense

**BR, 2026-10-05 21:16:**

> 1. yes, beeline.
> 2. yes, but only when light conditions make it plausible - i.e. dark conditions + lit up = easier to spot
> 3. yes, at least glowstick - but it must not work _too_ well
> 4. yes

**BR, d100-2 first look (2026-10-06 14:21):**

> the glow stick is too weak in illuminating - let's try 100% more
> also dropping an active glow stick on the ground seems to make it not illuminate anything

**BR, d100-2 answers (2026-10-06 14:24):**

> 1. no - it should be completely overtaken by the sun's light
> 2. yes
> 3. press-and-hold T -> the longer held -> the longer the throw. Cancel by right-clicking mouse

**BR, 2026-10-07 14:27:**

> "T only throws a lit glowstick :D / it should of course throw whatever it is is wielded in primary hand. It requires to be held 1 second before throwing"

BR approved weight-limited range at 14:35; atmospheric drag follows its separate issue, #368. With no handling job active, charge begins on press; a throw pressed during a rack or magazine job starts charging when that job finishes. The minimum remains a release gate. See `src/game/inputBindings.ts`, `player.throw`, and `src/game/play.ts`, `finishItemThrow`.

Daylight overwhelms portable light wherever the sky is open, including outdoor shade; a roof or cellar leaves light mattering at noon. Brighter glowsticks keep their existing sensing reach. A lure gets one investigation so it creates risk without holding a shambler indefinitely; a nearby sound takes priority. Charging makes throw distance a deliberate choice, and cancellation prevents a mistaken release.

**In:** Lights affect detection through the existing zombie attention owner (`src/core/zombies.ts`, `ZombieSystem`). The player has a headlamp and a throwable glowstick; light sensing does not add a second pursuit system.
**Saves:** Headlamp and glowstick state use their existing item/light owners. Any persistent zombie attention target belongs to the existing saved zombie state and fingerprint; light visibility is derived from active sources and surrounding conditions.
**Tests:** a visible light can become the beeline target; an investigation searches and returns without re-alerting to the same lure, and near sound outranks a lure. Daylight sky exposure gates player light and world lures locally, including open noon, noon indoors, open night and outdoor shade. A dropped or thrown active glowstick appears in the renderer's fixed light set and is a zombie sense source; stored lights that do not shine into the world are excluded. A primary-hand item throws only after the minimum simulation-time hold; shorter releases leave it in hand, and the recorded throw preserves its range and item state. A longer charge throws farther, capped at full charge. Heavier items travel no farther than lighter ones at equal charge; charged range remains tuned for light items. Right-click cancels, and the world trace stops at walls and ceilings before settling on solid ground. Headlamp state survives the existing item save round trip. Do not pin tuning values, content counts or seeded positions.
**Done when:** visible light sources affect zombie attention only where plausible, the headlamp and charged glowstick are useful without replacing sound or sight, and dropped light state remains consistent across simulation and rendering. Held-item throws retain their state, with glowstick light still shining after landing.

### 3.7 Modular weapons

**BR, 2026-10-05 21:26:**

> 3.7
>
> 1. a first set, as suggested
> 2. yes, and specifically only the optic zooms, not the surrounding view. That is, when looked through, a 4x optic would be a big circle occupying the main area of the screen - but the view outside the optic is the normal view (1x) but blurred - we're trying to make it feel like IRL looking through an optic aiming
> 3. this calls for a specific UI, because we need to be able to manage adding and removing mods. In dayz they're slots on the weapon that you can operate on when the gun is wielded or on the ground. See Screenshot_2026-10-05_21-24-27.png - there's optic slots, tac light, supp, mag and then the battery slot for the tac light too
> 4. improvised suppressor doesn't last as good as a real one, but far more than a couple of shots - maybe 40, wheras the real one would last maybe 400

**In:** First set: optics, suppressor, flashlight mount and foregrip. BR's 2026-10-01 modular-weapons ruling, as recorded in `gungen/PROJECT.md`, "The goal (BR, 2026-10-01)" (the gungen side is gungen.2 there): the player fits mods (optics first, then suppressors and other muzzle devices, foregrips, tactical flashlights and lasers, magazines, stocks and so on) found as loot or crafted, through the mount points a gun offers. Mods change the gun in play (a suppressor's noise, a flashlight's light as a sense, a grip's handling). Fitting and removing a mod is handling. A found gun comes with the generator's default mods. Add a weapon UI with slots operable while the weapon is wielded or on the ground. The referenced screenshot is a DayZ M1A SOCOM inspect view with optic, tactical-light, battery, suppressor and magazine slots. A magnified optic zooms only its large lens circle; outside stays 1× and blurred. The suppressor life is a first tuning target from BR's approximate examples, not a test-pinned count. Dependencies include 3.2's real magazine and firearm state.
**Saves:** Installed mod ownership/slot assignment and any condition or battery state that changes behavior are saved with their owning weapon/items. Optic presentation and UI selection are transient; the active attachment arrangement that changes shots, handling or light is fingerprinted.
**Tests:** fitting and removing a mod works from wielded and ground weapons, rejects incompatible slots, and survives save/load; a tactical light preserves its battery; only the optic lens zooms while the outside view remains unzoomed; improvised suppressors outlast a couple of shots but wear sooner than a real suppressor. Avoid exact shot-life assertions.
**Done when:** the first attachment set can be fitted and removed through the slot UI, affects its owning weapon, and survives save/load.
**First look / BR approval:** optic view, slot UI and attachment presentation.

### 3.8 New zombie types

**BR, 2026-10-05 21:29, inline answers to the lead's questions:**

> 1. Scope: all four in Slice 3, or a first set? For example, runner and crawler first, since screamer and bloater lean on hordes (3.9) and the body model (3.4).
> first set only
> 2. Runner: a sprinting beeline, and rarer than shamblers?
> yes
> 3. Screamer: does its scream become an attention source that every zombie within some radius beelines to?
> yes
> 4. Bloater's cloud: what does it do to you? Damage over time, wound infection (from 3.4), blurred vision, or something else?
> defer

**BR, 2026-10-06, verbatim (#308):**

> “maybe we should consider adding a 'boss' mob - maybe an amalgamation of several shamblers - an enemy the size of a car”
> “yes, I think it's worth it, and it makes it end with something new and exciting”

**In:** Add the runner (sprinting beeline, rarer than shamblers), crawler and apex enemy, building on the existing type-data model and d84's beeline. Each zombie type gets distinct sounds. The crawler uses the approved type design; the apex enemy's design questions are tracked in #308. Infection consequences depend on 3.4. Screamer and bloater are deferred (#280).
**Saves:** Type identity and actor movement/body state use the existing zombie snapshot. Save/fingerprint any persistent type-specific ability state introduced by implementation; do not save a second copy of shared attention state.
**Tests:** a runner pursues by sprinting beeline; a crawler is distinguishable and interacts with body-region damage; each type has a distinct sound; type identity and state survive save/load; spawn rarity is validated as a property of the authored source, not a pinned generated count.
**Done when:** runner, crawler and apex enemy are distinct playable threats and their persistent state round-trips.
**First look / BR approval:** runner and crawler silhouettes, movement and hit response (the crawler's static prone pose first, then its drag gait and in-game hit response); the apex enemy's size, silhouette and encounter read.

**Work split:** d106-1 implements the runner and crawler; #308 tracks playtest 1's apex enemy as a separate work item within 3.8.

**Crawler form and pose (BR, 2026-10-06–07):** the question was whether the crawler should be (a) a prone ground-crawler dragging itself on its arms with trailing legs, (b) a low, hunched humanoid on all fours, or (c) a short, hunched humanoid variant.

BR (2026-10-06 21:46):

> “okay, yeah runners, I see when I spawn them now; but crawlers I'm not sure - aren't they supposed to be crawling?”

BR (2026-10-06 21:49):

> “crawler: (A)” / “the other variants you mention are other mobs, not yet defined, but each having their place in the roster at some point”

The two alternatives are future mobs, not crawler variants. BR's follow-up asked whether the crawler should keep full legs or have stumps, and noted hovering. BR (2026-10-07 00:18):

> “1. i'm thinking it shouldn't have full legs / and it looks to be hovering a bit over the ground, so that might be an issue”

After seeing the stumps, BR's question was whether they read correctly despite the remaining hover. BR (2026-10-07 00:37):

> “thigh stumps look good / but still hovering: Screenshot_2026-10-07_00-37-27.png”

BR's grounded prone form and perception-directed gaze make the crawler's shape and attention readable. Gaze stays presentation-only, while the drag gait and runner/crawler flinches affect hit geometry so attacks follow the visible pose; they add no saved state but change replay compatibility. Gameplay stagger, slowdown and knockdown remain open for BR. Generated support validation protects the grounded form. See `mobgen/src/mob/crawler.ts`, `crawlerGaitPose`, `src/core/zombiePose.ts`, `posedShambler`, and `mobgen/src/core/generate.ts`, `resolveSupportBones`.

**Legendary direction (BR, 2026-10-05 21:29):** “sounds about right” on the proposed cost; effects are “mostly vanity thing, but we might come up with something along the way”. The 3.1 skill work carries d83's scale/legendary contract; effects beyond vanity are out of this slice.

### 3.9 Hordes and the background tier

**BR, 2026-10-05 21:32, inline answers:**

> 1. Flow fields: ... Do background zombies just beeline in big cheap steps, and flow fields drop from the plan?
> yes
> 2. Tier sizes: keep CHALLENGES.md's targets for Slice 3, about 60 active and 300 in the background?
> let's keep it like that for now, but ideally we could make it so we can have many more at once
> 3. First horde: what is it in Slice 3? For example, a group of 20–50 drifting together through the hamlet, drawn by loud noise such as gunshots, or roaming at night.
> yeah, let's try that to start off with
> 4. Gunshots: does a gunshot carry far enough to pull background zombies, and hordes, toward you? That would make firing a real decision.
> yes, it's loud and brings in enemies from far

**In:** Background zombies beeline in big, cheap steps; no shared flow fields. Keep the targets in [CHALLENGES.md](CHALLENGES.md), “Many zombies in a browser”, as an initial target while measuring whether substantially more are possible. Add the first group drifting through the hamlet, attracted by loud noise such as gunshots or roaming at night. Gunshots carry far and pull background zombies and hordes toward the source. Abstract region-map hordes remain Slice 4.
**Saves:** Save the background actors/group state needed to continue movement, target and noise response after load. Keep active and background ownership explicit and fingerprinted; do not serialize a derived navigation field.
**Tests:** repeated simulation steps move background actors toward the chosen target without traversing blocked geometry; gunshot attention reaches distant background actors; group behavior stays deterministic over save/load; measure the active/background workload and frame cost without asserting a drifting actor count in a unit test.
**Done when:** the first horde responds to noise, background actors beeline with bounded cheap work, and the measured workload is recorded against the project performance gate.
**First look / BR approval:** the moving horde and its response to a distant gunshot.

### 3.10 Input recording and replay

**BR, 2026-10-05 21:35:**

> 1. depending on (perf) cost: prefer always on
> 2. i think downloaded file makes most sense - depending on size it could be an attachment to the github issue?
> 3. i'd say in general until we've hit v1 RC

The scope question was whether replay should include inventory and crafting screen use. BR asked on 2026-10-06:

> "how much effort is it to scope it to inventory and crafting too?"
> "yes, do inventory and crafting in the validation too"

**In:** Keep a rolling recent input window, if its measured performance cost allows; export a replay file containing the starting save and recorded inputs, small enough for a GitHub issue attachment where possible. Make it available in all builds until v1 RC. The replay is an artifact, not a second game-save format.
**Saves:** No new world-save state. The replay file carries the start save and input sequence with enough build/simulation identity to reject an incompatible replay; the recording buffer is transient and the export is explicit.
**Tests:** Replaying a captured input sequence from its start save reproduces the same simulation result, including inventory and crafting screen commands; export/import preserves command parameters and item identity, and fails clearly when the build/simulation identity is incompatible; measure always-on buffer cost before accepting it.
**Done when:** a bug can be reported with a downloadable replay that reproduces the same state after look, movement, inventory and crafting use, and always-on capture fits the measured budget or is kept only when cost permits.
At d101-4, replay samples also preserve whether the source world was ready under the player. Source movement can be skipped while streamed terrain is missing; playback waits when a recorded move needs terrain and keeps source-side skips when it did not. Replay captures the source simulation's end time so verification is independent of how render frames grouped the fixed player ticks. See `src/game/session.ts`, `createSession`; `src/game/inputReplay.ts`, `encodeInputReplay`; and `src/game/play.ts`, `stepSimulation`.

Implementation is in `src/game/inputReplay.ts`, `InputReplayRecorder`; inventory and crafting commands converge on `applyReplayActionPayload` in `src/game/replayCommands.ts`, wired by `startPlay` in `src/game/play.ts`. The player-facing rationale is in [CONTROLS.md](CONTROLS.md).

Replay records generated terrain columns, not a derived readiness bit: `src/game/streamer.ts`, `Streamer.generatedColumns`, captures the recording boundary, while its replay-controlled generation methods prevent renderer streaming from advancing terrain ahead of the artifact. `src/game/inputReplayPlayer.ts`, `InputReplayPlayer.next`, prepares each tick's ordered column changes as it consumes the prior sample; repeated changes to one column are meaningful when a load and unload both happen before the next player tick. `src/game/inputReplay.ts`, `joinInputReplayWindows`, preserves those tick-zero events across rolling-window joins instead of reducing them to their final terrain state. `src/game/inputReplayDriver.ts`, `InputReplayDriver`, owns replay initialization and stepping, while `nextReplayInputSample` shares sample consumption, compression and look application between production and the unit harness. This lets replay zombies read the terrain that made their recorded column ready, while column-load spawns and furniture still enter through session streaming effects. A format change rejects older replay files; world-save state remains separate and unchanged. At d119-2, a two-minute, 7,200-tick profile with 64 starting generated columns and 120 transitions added 3,063 serialized bytes (about 2.4% of the baseline artifact) and 4,864 bytes to the recorder's retained-buffer estimate. Paired recorder timings did not distinguish an added per-tick cost from timer noise.

### 3.11 Authored playtest map and playtest

**BR, 2026-10-06 12:31:** “can we continue on the authored playtest map meanwhile?”
This request brings beats 1–3 forward while the agreed beats 4–6 wait for their
dependencies.

**BR, 2026-10-03 14:52, verbatim (#181):**

> 3. no I didn't mean a mission assigned to the player, but rather that the lore could be that the medial place was setup in order to do that - and that there is lore items for the player to discover / 4. preliminary: yes

**BR, 2026-10-05 21:37:**

> what you call "the mission" is not a mission for the player - it's simply a raison-d'etre for the medical site
> q1: yes, those are the beats
> q2: see above
> q3: bigger
> q4: i have one tester - the other two are open

**In:** Finish the authored progression from the lone house through the hamlet, hunting cabins, a larger standalone workshop, medical site and low-to-mid-tier military site. BR's 2026-10-05 answer confirms the 2026-10-03 ruling: the medical site's virus-sampling research is lore, not a player mission.
- **Discoverable lore:** readable notes and documents, perhaps a wall notice; distinct from 2.5's recipe-teaching books (BR, 2026-10-03; confirmed 2026-10-05).
- **Nights:** night 1 near the hunting cabins; night 2 at the medical site (preliminary, BR, 2026-10-03).
- **Armoury access:** the camp must remain reachable if the clinic key stays on the dead officer. BR said at 19:03, “#320 the prying should take a bit longer - maybe 5 ingame seconds? Eyeballin” and at 19:05, “yeah, let's not make it a long action” / “but it should be skill dependent - starting at 15 seconds - gets faster by 'fabrication' or similar woodworking skill”. Asked whether to add `fabrication`, use `mechanics`, or use `crafting`, BR answered “1b”: use the existing `mechanics` skill. BR also answered “2 sounds like a good start” to the proposed level-10 duration of 7.5 real seconds—half the 15-second level-0 duration—with 30 strikes retained. The lead reads 15 seconds as real play time; keep prying out of compression so the crowbar's noise draws the dead at normal pace. The matching key remains the quiet route, and `lock_test` is a first-look fixture, not the authored military site. BR answered #309 at 19:31, “it's destroyed”: prying destroys the padlock and leaves the door unlocked, making forced entry one-way. See `DESIGN.md`, “Base building and electricity”, and `src/core/blockEntities.ts`, `BlockEntities.breakLock`.
- **Tester prompt:** “find the military camp” (BR, 2026-10-06 13:05: “yes, confirmed”; #181).

The military area supplies the AR, AK and their ammunition from 3.2. Use the authored-site pipeline and fixed key loot with seeded filler. BR agreed beats 4–6 in #181. The dependency-independent workshop core is in d124-2: `src/content/base/templates-workshop.json` owns its reusable interiors, `maps/playtest.tmj` owns the site and route, and `src/content/base/layouts-playtest.json` is the committed export. Its optional door `openNoise` keeps the roller entry loud while the side door stays quiet (`src/core/schema.ts`, `FurnitureSchema`; `src/game/doorAction.ts`, `registerDoorAction`). Fixed promises and seed-owned filler remain separate; the radio is loot, not an implementation decision about whether it works. The workshop's authored `r` spawn markers use the existing runner type; no scripted spawns are used. Its static stripped 4×4 comes from the vehicle-spike blueprint in `src/vehicles/rangeRover.ts`, rendered by `src/render/workshopVehicle.ts`, while furniture retains collision ownership. The main hall roof is double height by BR's 2026-10-07 16:33 request: “we will likely want to raise the roof too in the workshop main hall to double height”. Quiet/light choice loot remains deferred to 3.7. The medical and military map rounds retain their dependencies on 3.4 and 3.8, and 3.2, 3.8 and 3.9 respectively. Do not block beats 1–3 on those later rounds.
**Saves:** The authored layout, fixed placements and seeded loot regenerate from the site and seed. Dynamic changes and looted items use the existing world/inventory save; no separate map-progress state is added.
**Tests:** authored content validates; site generation is deterministic across chunk order; required progression and routes remain traversable; fixed key loot and seeded filler follow their separate ownership without pinning exact coordinates or complete loot lists. The playtest records consented observation notes and local metrics without changing game state.
**Done when:** the approved map supports the end-of-slice playtest, its two nights and progression are playable, the checklist links its evidence, and the playtest findings are recorded before Slice 4 planning.
**First look / BR approval:** the completed authored map, including the workshop/medical/military progression and night locations.

## Dependencies and order

- 3.1 precedes 3.2 and 3.3.
- 3.4 precedes the infection parts of 3.3 and 3.8.
- 3.5 precedes 3.6 and 3.9.
- 3.2 precedes 3.7.
- 3.10 starts early enough for later milestones to use replays.
- BR agreed beats 4–6 in #181. Beat 4's choice-critical attachments remain deferred to 3.7, and its authored `r` spawn markers use the existing runner type without scripted spawns. d124-2 supplies the independent workshop core. Beat 5 follows 3.4 and 3.8, and beat 6 follows 3.2, 3.8 and 3.9.

## Carried in

- **d84, shamblers beeline (#279):** the beeline movement brain every zombie milestone uses; attention selection is unchanged. It replaces the proposed flow-field dependency; #244's route follow-up is obsolete under this direction.
- **d83, skills and legendary:** the 0–10 skill scale and legendary level feed 3.1; #275 rules activity tiers, crafting practice, reading and dropped excess.
- **d80 recoil and d78 impacts:** their firearm-owned recoil, aim control and shared shot-trace work feed 3.2.
- **Authored sites:** the Tiled site / ASCII interior pipeline from #196 feeds 3.11.

## Open questions for BR

Only questions BR left open; don't infer answers from implementation or old proposals.

- **3.5 wall muffling — proposal above:** approve or replace the single coarse attenuation step when a wall lies between source and listener.
- **#181 beat 4:** whether the radio works, and which quiet-or-light craft path fixed workshop loot should cover fully. d124-2 places the radio and defers both decisions; its attachment-dependent choice loot remains deferred to 3.7. The template's `r` spawn markers use the existing runner type without scripted spawns. Beats 5–6 retain their own dependent map rounds.
- **#181 tester prompt:** confirm the wording when BR details beats 4–6. BR's 2026-10-05 22:17 proposal was: “Instead it could be: "find the military camp", maybe?”
- **#308 — playtest 1 apex enemy:** the design questions remain open; see 3.8.

## Definition of done

- Milestones 3.0–3.11 are merged and deployed with CI green, including their required type, unit, content and browser checks.
- Every new persistent simulation state is owned, saved, fingerprinted and covered by a current-build round trip. The default test run remains within the applicable budget or has a coverage-based explanation and a plan to keep it fast.
- The noise-to-positional-sound contract holds; recordings replay deterministically; performance work is measured against the approved workloads.
- The checklist issue links evidence and carried-forward work; the end-of-slice playtest questions are asked of the required testers and its findings inform Slice 4.
- BR has approved the required first looks for ready/ADS, firearm gore/impacts, optics, new zombie types, the horde and the authored map.
- A retrospective records what changed and what carries forward.
