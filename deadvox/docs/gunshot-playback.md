# Gunshot playback and debug full-auto (d18-2 / d18-3)

BR's 2026-10-02 listening verdict exposed two presentation defects:

- Both AKM samples last 2.171s. The four-voice admission check **dropped** new
  triggers while their tails played; pending fetch/decode callbacks also occupied
  those slots. `onended` did release them, but only after the long samples ended.
- Player shots used a stationary world-space panner at the firing position.
  Running moved the listener away from that source; listener updates happen at
  the end of the frame. No velocity/Doppler API is configured by this adapter.

## Policy

Every accepted shot selects its seeded variant and starts after the shared
variant load resolves. Pending loads do not occupy playback slots. Fetch/decode
remain deduplicated per variant; no separate audio queue or scheduler is added.

Following BR's browser-limit clarification, **32** full voices are retained per gunshot event. A new shot steals the oldest
full voice: its gain ramps linearly to zero over **10ms**, then WebAudio stops it.
d18-3 retains up to **32** retiring crossfade tails per event, so all eight retirees
in the review's 40-shot same-quantum cold burst receive the full fade instead of
hard-stopping seven of them. The physical ceiling is **64 connected sources** per
event (32 full + 32 retiring), not an unbounded pending-decode reservation pool.
Already-stopped tails are disconnected even if `onended` delivery is late.
Cleanup is idempotent; a late ended callback cannot release a replacement voice.
A pathological burst exceeding 64 simultaneous starts still finishes the oldest
retiree early to enforce that ceiling. The supported 75/100ms sustained cadence
exceeds the 10ms fade window and never needs that fallback. Actual perceived
cadence/clicks require BR's ears.

The player's `firearmShotSound` cue is listener-relative. It bypasses the panner,
distance attenuation and world occlusion, while retaining the gunshot's **world**
volume category. Moving/turning therefore cannot leave the sample behind. The
same cue accepts an actor perspective, and the general playback API remains
world-positional by default for future other-actor shots. Exact preview playback
on `sounds.html` is listener-relative too.

`game/audio.ts` and `game/audioPresentation.ts` are excluded presentation modules.
`core/soundPicker.ts` remains an explicit simulation fingerprint root, and save
logic remains included. The real-graph canary changes the voice cap from its configured value to 64
without changing the hash, but changing the picker's seeded stream changes it.

## Debug range full-auto

Hold primary with a firearm equipped in debug mode; release stops firing. Other
item actions remain edge-triggered, and left-hand firearm clicks remain single
shots. The existing 60Hz player scheduler samples the trigger; `DebugFirearmTrigger`
computes deadlines as `burstStart + shotIndex * (60 / rpm)`, not repeated frame
rounding or wall-clock timers. Every deadline produces its own deterministic case
seed, flying case, saved case-pile increment and sound pick. A short click released
between ticks still fires once. Menus, build mode and inactive input reset the burst.
The held trigger is transient input, not resumable save state.

The AR handling stand-in is **800rpm / 75ms**, with its cycle phases scaled to
that period. The existing fallback remains **600rpm / 100ms** (including any future
AK using that fallback); no AK weapon/model is newly added here. g35's exported
handling data will replace these stand-ins. Presentation starts are dispatched at
the player-tick boundary (up to 16.7ms after their exact simulation deadline),
then after sample decoding on the first cold use; no claim of sample-accurate
wall-clock playback is made.

Review: `http://192.168.9.39:5189/?seed=73&debug=1&radius=64&cam=43.50,33.00,0.00,-90.0,0.0,0.0`.

## Related observation, deliberately not changed

The player's footsteps and melee sounds use the same fixed-world-position path
(`SessionAudio` → `playSessionSound` → `GameAudio.play`). Their tails can likewise
be left behind by movement. They are not converted to head-locked playback in
this gunshot-only round.

## Proof

`audioGunshot.test.ts` covers warm rapid-fire admission (40 starts), delayed cold
loads (40 full-fade starts, two fetches/decodes, then 80 starts to exercise the
64-source safety ceiling), bounded sources even without ended events,
idempotent cleanup, and player translation/rotation versus world-shot routing.
The primary-action browser contract checks the actual firearm hook produces
head-locked diagnostics (zero distance, no occlusion filter). These are routing
and lifecycle proofs, not a substitute for listening.

`firearmHandling.test.ts` checks 800/600rpm deadlines under regular and coarse
polling, release, quick clicks and weapon changes. The real-graph fingerprint
canary checks cadence arithmetic remains fingerprinted while voice caps do not.
`test/browser/full-auto.mjs` uses native WebAudio with the actual bundled samples:
40 cold starts retain fades; a held AR produces 27 shots/cases in two simulation
seconds; release stops; a warm two-second burst with 32 existing tails exercises
stealing, starts one native source per shot, and releases every source/gain node.
