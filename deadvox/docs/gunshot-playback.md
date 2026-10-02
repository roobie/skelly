# Gunshot playback (d18-2)

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
There is at most **one** retiring crossfade tail per event (at most 33 connected
sources total). Another steal finishes an earlier retiree before admitting a new
one, so cold-load bursts or delayed `onended` callbacks cannot grow the tail set.
Cleanup is idempotent; a late ended callback cannot release a replacement voice.
Ordinary human firing intervals exceed the fade window. In a same-render-quantum
cold burst, earlier retirees may be finished before their full fade window; the
new attack is never rejected. Actual perceived cadence/clicks require BR's ears.

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

## Related observation, deliberately not changed

The player's footsteps and melee sounds use the same fixed-world-position path
(`SessionAudio` → `playSessionSound` → `GameAudio.play`). Their tails can likewise
be left behind by movement. They are not converted to head-locked playback in
this gunshot-only round.

## Proof

`audioGunshot.test.ts` covers warm rapid-fire admission (40 starts), delayed cold
loads (36 starts, two fetches/decodes), bounded sources even without ended events,
idempotent cleanup, and player translation/rotation versus world-shot routing.
The primary-action browser contract checks the actual firearm hook produces
head-locked diagnostics (zero distance, no occlusion filter). These are routing
and lifecycle proofs, not a substitute for listening.
