---
id: skelly::deadvox-controls
description: Draft of deadvox's whole verb-to-input map for Slices 1-3, with the state each input depends on and the browser and OS conflicts it must avoid
tags: [deadvox, design, controls, input, ui]
created: 2026-09-28
status: draft
read_if:
  - you plan or change player or debug input bindings
  - you review BR's control rulings or unresolved input questions
---

# deadvox — controls (draft)

[[THIS is_grounded_by: INTERFACE.md]]
[[THIS is_grounded_by: DESIGN.md]]
[[THIS is_grounded_by: EPIC.md]]

**Status:** draft for BR. Nothing here is decided unless it says "BR ruled".
BR asked on 2026-09-28 for the whole map to be designed up front instead of one
key per issue (#27 started it), because the failure lives in the whole map:
a key given away today collides with a verb that arrives in Slice 3. Read with
[INTERFACE.md](INTERFACE.md) ("Afford, don't instruct", "Readying before
acting").

## What's already ruled

- **Ready before acting (BR, 2026-09-27; direction for #267, 2026-10-05):**
  holding right mouse puts melee en-garde. When #267 lands, holding right
  mouse readies a firearm, and firearms fire only while ready and never while
  sprinting. When #267 lands, ready movement is a separate duck-walk gait, not
  crouch, and mainly a speed factor. BR said its speed "can be a skill-dependent thing" and
  called it an "own gait, but mainly it's simply a speed factor"; which skill
  applies remains open in #267, with a generic "warfare" skill only a lean. BR
  also said, "yeah, melee needs 'en-garde' on right-mouse-hold, which also
  enables blocking incoming melee (based on skill)". Blocking requires en-garde
  plus S: "1a. yes S is required to actually block from en-garde"; success
  depends on skill. When #267 lands, an unreadied firearm's left-click does
  "nothing": no shot and no nope sound. When #267 lands, the held firearm pose
  shows ready state, not a HUD indicator. Middle click or Shift toggles hip and
  sights while a firearm is ready.
- **F interacts; Q and E are reserved (BR, 2026-09-27).**
- **F9 is the main menu; F10 belongs to the browser (BR, 2026-09-28).**
- **Left click uses what you hold (BR, issue #27, 2026-09-26):** "hold the
  flashlight in hands, then left-click to activate (left-click generally means
  'do the thing with the thing you're holding')." For held food, drinks and
  bandages, BR later ruled (2026-10-05): "activate them"; bandages remain
  refused until Slice 3's body model supplies wounds. Dominance selects the hand
  role; it does not move an item between physical slots. See "The two hands"
  for the policy's owners rather than a second binding map.
- **Long uses could be press-and-hold (BR, 2026-09-28)**, direction rather than a
  ruling: holding left click performs a long use, and releasing it early
  cancels.
- **Every key can be rebound, from one registry (BR, 2026-10-04):** "we must make
  it so the player can rebind any keyboard input - this means we need a 100%
  centralised registry".
- **Debug keys sit behind F1 (BR, 2026-10-04):** "gating them all behind e.g.
  holding down F1 then pressing the debug key? Unless some special circumstance
  for a key need it readily available". This answers open question 6.
- **No Ctrl or Cmd, ever (BR, 2026-10-04):** "due to the browser being the
  browser, we cannot use Ctrl or Cmd for anything, ever." This answers open
  question 2.
- **Quick actions sit behind a held T (BR, 2026-10-04):** "like with F1 being
  the debug mod key ... we'd use a non modifier key, like say 'T' as a general
  quick action mod key", and "hold T+click on item does the quick action (auto
  move)". T is the default; the gate is rebindable like any other key.
- **R only reloads (BR, 2026-10-04).** "It shall mean only (re)load in the
  default view". With a shotgun: "press and hold `R` to load it with shells from
  inventory double-press `R` to rack", and "Single tap r does nothing". This
  answers open question 4.
- **No rest or sleep keys (BR, 2026-10-04).** "`rest` shouldn't have a dedicatec
  keybind - instead, you interact with 'restable' items - e.g. beds, sofas,
  chairs, etc", and "`L` remvoed - sleep is on sleepable objects, like bed".
- **Wield, then activate (BR, 2026-10-04):** "diegesis: wield item->activate".
  "using the key means wielding it, and activating it on the door". An ammo box
  is the same: "that's not a thing you do in inventory - you wield the box and
  activante it in oder to unpack". No inventory action or modifier chord
  replaces it.
- **No U use key (BR, 2026-10-05 13:16):** "U shouldn't be a thing - where does
  this false knowledge still stand?"
- **Hands follow handedness (BR, 2026-10-04):** whether "one's avatar is right-
  or left-handed dominant is a thing we should accomodate. This'd mean that all
  quick actions etc take this into account, and the flip of
  activate-what's-wielded vs activate-off-hand". The creation choice belongs to
  actor identity and Continue restores it; see `docs/character-handedness.md`.
  Planned controls must use semantic roles rather than physical hand names.

- **R reload only in the default view (BR, 2026-10-04):** with a pump held,
  hold to load loose shells, double-press to rack, and a short single tap does
  nothing. Gesture thresholds belong to `src/game/reloadInput.ts`,
  `RELOAD_GESTURE_MS`, not the ruling. No reloadable item means no action.
  Inventory R still rotates. **Rest and sleep have no dedicated key** (BR,
  2026-10-04 12:15): F starts them on the targeted furniture, F again or X
  stops, movement stops, and C resumes after an interruption only while the
  same piece remains reachable. L remains a legacy sleep binding until d44 removes it.
- **Sealed ammunition boxes (BR, 2026-10-04):** wield with H in inventory, then
  activate with the held-item primary action to unpack. No inventory Unpack/Load.
  Opening duration belongs to `src/game/unpacking.ts`, `BOX_UNPACK_SECONDS`.
  X cancels without loss; overflow becomes an ordinary pile.

## Principles

1. **One verb, one input, in every state where the verb exists.** A key may mean
   different things in different states only when the state is visible on the
   body or the screen (a menu is open, the weapon is raised). Never on hidden
   state.
2. **Mistakes are cheap.** Anything that spends an item, makes noise or starts a
   long action needs a deliberate input (hold, or a stance first), so a stray
   click does nothing costly. Noise is the real cost of a wrong click here: the
   hearing model turns an input slip into an alerted street.
3. **The body shows the state.** Ready, a long use in progress, which hand is
   active: each is visible in first person, not written on the HUD.
4. **One binding table.** Every input is read from the table in
   `src/game/input.ts` (`KEY_BINDINGS`), so labels, help and hints can't go
   stale and a rebind is one edit. Today most keys are still literals in
   `play.ts`, `inventoryScreen.ts` and `debug/index.ts`.
5. **Physical positions, not letters.** Bindings use `KeyboardEvent.code`
   (already the case), so WASD stays in place on AZERTY or Dvorak. Labels shown
   to the player should come from the layout map where the browser has one.

## Browser and OS constraints

These are facts to verify on each target before a key is assigned, not
assumptions. The ones marked **verify** have not been checked for this game.

| Input | Problem | Status |
| --- | --- | --- |
| F10 | Firefox's menu bar | known; F9 used instead |
| Alt | Firefox shows its menu bar on release; many Linux window managers use Alt + drag to move windows | avoid |
| Escape | Always releases pointer lock; the browser owns it | fixed; never bind |
| Ctrl + W, Ctrl + T, Ctrl + N, Ctrl + Q | Browser shortcuts that pages generally can't prevent outside fullscreen with the Keyboard Lock API. With Ctrl as any held modifier, W's key repeat while walking arrives as Ctrl + W: the tab closes | ruled out: no Ctrl or Cmd bindings at all (BR, 2026-10-04) |
| Ctrl + click on macOS | The OS treats it as a secondary click; unknown whether that still holds under pointer lock | moot: no Ctrl or Cmd bindings (BR, 2026-10-04) |
| F5, F11, F12, Ctrl + R | Reload, fullscreen, devtools | avoid |
| Tab | Moves browser focus; the game prevents it already | in use (inventory) |
| Backquote | Physical key exists on all common layouts; `code` is stable | in use (debug panel) |
| Middle click | Some Linux desktops paste on middle click; in a pointer-locked canvas it's harmless | acceptable |

## Verbs, Slices 1–3

What the player can do, and when it arrives. "Now" means in the game today.

| Verb | When | Kind |
| --- | --- | --- |
| Move, look, jump | now | continuous |
| Walk/jog toggle, sprint | now | stance |
| Interact with the world (doors, furniture, piles) | now | instant |
| Inventory screen | now | menu |
| Quickbar slots 1–5 | now | tap to take or put away; hold to use |
| Use held item: light on/off | now (quickbar hold or primary action) | instant |
| Use held item: eat, drink, bandage | now (primary action or quickbar hold) | long |
| Cancel handling | now | instant |
| Rest, sleep, stop, continue after an interruption | now; rest and sleep move to F on restable and sleepable furniture (BR, 2026-10-04) | long, state |
| Melee strike | implemented; see `src/game/primaryAction.ts`, `selectPrimaryAction` | instant, noise |
| Main menu | now | menu |
| Ready a weapon, block | Slice 3 (ruled) | stance |
| Hip / sights toggle, shoot | Slice 3 (ruled) | stance, noise |
| Reload, check magazine | Slice 3 | long |
| Crouch | Slice 3 (sight and noise when crouching) | stance |
| Throw (flare, glowstick, lure) | Slice 3 | instant, noise |
| Put the held item away (stow) | now (tap its quickbar slot) | handling |
| Use off-hand primary action | implemented; see `src/game/input.ts`, `KEY_BINDINGS` | instant |
| Read a book, craft, repair | Slice 2 | long, menu |
| Lean | reserved (Q, E) | stance |

## Proposed map

Shipped profile. The development profile adds the debug keys (see "Debug keys"
below). Implemented hand activation is not duplicated in this proposal; see
`src/game/input.ts`, `KEY_BINDINGS`, and "The two hands".

| Input | Unready | Weapon ready | Menu open | During a long action | Interruption shown |
| --- | --- | --- | --- | --- | --- |
| W A S D | move | move in the ready-only duck-walk speed factor, not sprint or crouch; S plus en-garde (right mouse) blocks with skill-based success | menu navigation where it has any, otherwise nothing | nothing (the action holds you) | nothing |
| Mouse | look | aim | drawn cursor | look | look |
| Left click, hold | unreadied firearm: nothing, no shot or nope; melee: no swing until en-garde; other held item: proposed long use (d44) | ready firearm: fire; en-garde melee: swing | drag | keep holding | — |
| Right mouse, hold | melee: enter en-garde; when #267 lands, also ready a firearm | hold stance; when #267 lands, ready movement uses duck-walk speed and cannot sprint; held pose, not HUD | — | — | — |
| Middle click | — | toggle hip / sights | — | — | — |
| Shift | sprint | toggle hip / sights | — | — | — |
| Space | jump | jump | — | — | — |
| Z | walk / jog toggle | — | — | — | — |
| C | crouch toggle (Slice 3) | crouch toggle | — | — | continue |
| F | interact with what's outlined; restable furniture starts or stops its action | interact | — | — | — |
| R | reload held pump: hold loads, double-press racks, tap does nothing | same | rotate while dragging | release cancels partial insertion | — |
| L | legacy sleep action on targeted sleepable furniture, until d44 removes it | — | — | stop sleeping | — |
| T, held | — | — | with a click on an item: its quick action (auto move; d44) | — | — |
| X | cancel handling | cancel | cancel handling | stop | stop |
| 1–5 | tap takes the slot's item into its capability-directed hand or puts it away; hold uses an available action from its location | same | assign the selected item to the slot | — | — |
| Tab | inventory | inventory | close inventory | — | — |
| F9 | main menu | main menu | close | main menu | main menu |
| Q, E | lean (reserved) | lean | — | — | — |
| G | throw the held throwable (Slice 3) | — | — | — | — |

Notes on the proposal:

- **Quickbar tap/hold:** a tap only takes an item into its capability-directed
  hand or puts it away; a hold uses its available action without making a firearm
  rack through the quickbar. The hold estimate belongs to
  `src/game/quickbarInput.ts`, `QuickbarInput`; the gesture is presentation state,
  not simulation time. A light primary action on either hand still calls
  `Survival.use`.
- **R never rests** in the default view (BR ruled). See `src/game/reloadInput.ts`,
  `ReloadInput` and `RELOAD_GESTURE_MS`, for gesture admission and thresholds.
  Inventory R rotation is a different view. F starts rest or sleep on its
  restable target; F again or X stops, movement stops, and C resumes after an
  interruption only while the same piece remains reachable. L remains a legacy
  sleep binding until d44 removes it.
- **C is overloaded**: crouch in play, continue on an interruption card. The card
  is on screen when C means continue, which satisfies principle 1, but it's the
  weakest overload in the map. Open question 5.
- **Crouch on C, not Ctrl**, whatever the Ctrl verification finds, because of
  the Ctrl + W risk.
- **Activation must not invent a second action owner:** capability admission
  belongs to `src/game/primaryAction.ts`, `selectPrimaryAction`; mechanics and
  handling retain their own costs and refusal rules.

## The two hands (issue #27)

**BR's handedness ruling (2026-10-04)** makes dominant and off-hand activation
roles follow the actor. The physical slots and a restored fist sequence remain
physical; otherwise Continue would silently move equipment or change the next
attack. See `src/core/character.ts`, `dominantSide` and `offSide`;
`src/game/input.ts`, `KEY_BINDINGS`; and `src/game/primaryAction.ts`,
`selectPrimaryAction`. Mouse 5 remains the explicit off-hand instant use;
Mouse 4 stays unbound because both side buttons can navigate browser history.
The selector refuses unsupported items and reserved support rather than
substituting a fist or the other hand's action.

Creation must precede gameplay construction, not mutate an already-running
actor. See `src/ui/saveController.ts`, `SaveController.setNewWorldLauncher`,
and `src/game/play.ts`, `startPlay`, for the accepted-launch boundary. Continue's saved
identity takes precedence over creation controls.

## Debug keys

The development profile binds B, G, H, K, N, P, T, U, V and Backquote
(`src/debug/index.ts`). Debug firearm handling is available only from a
`?debug=1` session: use G to spawn `debug_rifle_assault`, move it to a hand,
then use that hand's primary action. It produces no hits, damage, or ammo use;
each shot records one spent case. The deterministic handling range and table
sit beside the hamlet. In play, these letters are free in the shipped game but
taken in the development and playtest builds, which is where the controls get
tested; a shipped verb on V would collide in every test session. BR ruled on
2026-10-04 that debug keys go behind a held F1 (see "What's already ruled"),
which frees the letters for shipped verbs, including T for the quick-action gate.
d44 makes that change.

See `src/game/input.ts`, `CONTROL_CODES.descend`, for the debug noclip descend
binding, separate from reload and the reserved lean inputs. `Input` owns its
browser back-navigation refusal in the pointer-locked default view; menu text
editing retains native key behaviour.

## Open questions for BR

1. **The two hands:** bindings for dominant/off-hand activation remain open to
   revision after play; physical anatomy is not a binding policy.
2. ~~**Ctrl:** verify Ctrl + W under pointer lock before any Ctrl binding.~~
   **Answered (BR, 2026-10-04):** no Ctrl or Cmd, ever.
3. **Press-and-hold for long uses:** confirm as the rule for every long use (eat,
   drink, bandage, read, reload), with release before completion cancelling and
   nothing applied?
4. ~~**Reload:** R when ready (overloaded with rest), or its own key?~~
   **Answered (BR, 2026-10-04):** R only reloads, and rest has no key.
   Pump: hold loads, double-press racks, single tap does nothing. See
   `src/game/reloadInput.ts`, `RELOAD_GESTURE_MS`, for gesture thresholds.
5. **Continue after an interruption:** keep C (crouch elsewhere), or make the
   interruption card a two-button choice clicked with the drawn cursor, freeing
   C? Recommendation: the clickable choice, per INTERFACE.md's interruption row.
6. ~~**Debug keys:** panel-only shortcuts, or a prefix?~~ **Answered (BR,
   2026-10-04):** behind a held F1.
7. ~~**Stow on the held slot's key:** confirm pressing the held item's slot puts it
   away?~~ **Answered (BR, 2026-10-05):** a tap takes the item into its hand or
   puts it away; a hold uses an available action.

## Next steps

1. BR rules on the open questions; this document becomes `active`.
2. One implementation item: every input read from the binding table; left click
   and hold as specified; the debug-key move; a guard test that no module outside
   the table names a `code` literal; the help list and hints generated from the
   table.
3. Slice 3 verbs are added to the table as they land, against this map.
