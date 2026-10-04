---
id: skelly::deadvox-controls
description: Draft of deadvox's whole verb-to-input map for Slices 1-3, with the state each input depends on and the browser and OS conflicts it must avoid
tags: [deadvox, design, controls, input, ui]
created: 2026-09-28
status: draft
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

- **Ready before acting (BR, 2026-09-27):** holding the right mouse button
  readies a weapon; firearms shoot only while ready. A middle click or Shift
  toggles hip and sights while a firearm is ready; ready caps speed at a hurried
  march; right mouse plus S blocks melee. The current melee action remains the
  d7 left-click swing.
- **F interacts; Q and E are reserved (BR, 2026-09-27).**
- **F9 is the main menu; F10 belongs to the browser (BR, 2026-09-28).**
- **Left click uses what you hold (BR, issue #27, 2026-09-26):** "hold the
  flashlight in hands, then left-click to activate (left-click generally means
  'do the thing with the thing you're holding')." Initial hand mapping (BR,
  2026-10-01; open to revision): left click selects the right hand, `=` the
  left. Never punch with a hand holding an item; an empty right hand jabs, and
  fists alternate only when both hands are empty.
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
- **Hands follow handedness (BR, 2026-10-04):** whether "one's avatar is right-
  or left-handed dominant is a thing we should accomodate. This'd mean that all
  quick actions etc take this into account, and the flip of
  activate-what's-wielded vs activate-off-hand". d47 builds it. Until then, the
  map's right-hand and left-hand rows are the right-handed default.

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
| Quickbar slots 1–5 | now | select |
| Use held item: light on/off | now (quickbar second press or primary action) | instant |
| Use held item: eat, drink, bandage | now (same) | long |
| Cancel handling | now | instant |
| Rest, sleep, stop, continue after an interruption | now; rest and sleep move to F on restable and sleepable furniture (BR, 2026-10-04) | long, state |
| Melee strike | now (left click/right hand or `=`/left hand, unreadied) | instant, noise |
| Main menu | now | menu |
| Ready a weapon, block | Slice 3 (ruled) | stance |
| Hip / sights toggle, shoot | Slice 3 (ruled) | stance, noise |
| Reload, check magazine | Slice 3 | long |
| Crouch | Slice 3 (sight and noise when crouching) | stance |
| Throw (flare, glowstick, lure) | Slice 3 | instant, noise |
| Put the held item away (stow) | implicit today | instant |
| Use left-hand primary action | now (`=`, initial BR ruling #27) | instant |
| Read a book, craft, repair | Slice 2 | long, menu |
| Lean | reserved (Q, E) | stance |

## Proposed map

Shipped profile. The development profile adds the debug keys (see "Debug keys"
below).

| Input | Unready | Weapon ready | Menu open | During a long action | Interruption shown |
| --- | --- | --- | --- | --- | --- |
| W A S D | move | move, capped at a hurried march; S backs off (block with right mouse) | menu navigation where it has any, otherwise nothing | nothing (the action holds you) | nothing |
| Mouse | look | aim | drawn cursor | look | look |
| Left click, tap | right-hand item's primary action; if the right hand is empty, a right jab (fists alternate only when both hands are empty); unsupported held items show a hint | melee swing; firearms shoot only while ready | click under the drawn cursor | nothing | nothing |
| Left click, hold | long use of the main-hand item (eat, drink, bandage, read); releasing early cancels, nothing applied | — | drag | keep holding | — |
| `=` | left-hand item's primary action; nothing if empty, a hint if unsupported; never fists | same left-hand action | — | — | — |
| Mouse 5 (side forward button) | use the left-hand item's instant use (light on/off); nothing if the left hand is empty or has none | same | — | — | — |
| Right mouse, hold | ready the main-hand weapon; with nothing to ready, nothing | stays ready | — | — | — |
| Middle click | — | toggle hip / sights | — | — | — |
| Shift | sprint | toggle hip / sights | — | — | — |
| Space | jump | jump | — | — | — |
| Z | walk / jog toggle | — | — | — | — |
| C | crouch toggle (Slice 3) | crouch toggle | — | — | continue |
| F | interact with what's outlined | interact | — | — | — |
| R | reload the held gun: hold to load, double-press to rack, a tap does nothing; nothing without a gun | same | rotate while dragging | — | — |
| T, held | — | — | with a click on an item: its quick action (auto move) | — | — |
| X | cancel handling | cancel | cancel handling | stop | stop |
| 1–5 | take the slot's item into your hands; pressing the held item's slot puts it away | same | assign the selected item to the slot | — | — |
| Tab | inventory | inventory | close inventory | — | — |
| F9 | main menu | main menu | close | main menu | main menu |
| Q, E | lean (reserved) | lean | — | — | — |
| G | throw the held throwable (Slice 3) | — | — | — | — |

Notes on the proposal:

- **Quickbar second press:** using an item already in your hands still calls
  the shared `Survival.use` path. A light primary action on either hand calls
  that same path; the other capabilities dispatch to their existing actions.
- **R is no longer overloaded in play:** it only reloads (BR, 2026-10-04). It
  still rotates while dragging in the inventory, where the drag is visible. In
  the game today R still rests and L still sleeps. Both keys go with d45 (rest
  and sleep on restable furniture), and R gains reload with the pump (d36, #209).
- **C is overloaded**: crouch in play, continue on an interruption card. The card
  is on screen when C means continue, which satisfies principle 1, but it's the
  weakest overload in the map. Open question 5.
- **Crouch on C, not Ctrl**, whatever the Ctrl verification finds, because of
  the Ctrl + W risk.
- **Melee stays immediate:** d7's left-click swing is not gated by the firearm
  ready stance. D10 adds light and empty-hand actions to left click, and routes
  `=` to the left-hand item. A firearm's future shot remains ready-only.

## The two hands (issue #27)

**Initial BR ruling (2026-10-01; open to revision):** left click selects the
right-hand item's primary action; `=` selects the left-hand item's action. An
empty right hand jabs with the right fist, but an empty left hand does nothing.
Fists alternate only when both hands are empty. Never punch with a hand holding
an item; unsupported held items show a hint. Key codes live in
`src/game/input.ts`; the hand mapping lives in `ACTION_HAND_BINDINGS` and the
capability table in `src/game/primaryAction.ts`, so revising the policy is a
small edit. Mouse 5 remains the explicit off-hand instant use; Mouse 4 is left
unbound because both side buttons can navigate browser history.

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

## Open questions for BR

1. **The two hands:** BR's initial right-hand/left-hand key mapping is open to
   revision after play.
2. ~~**Ctrl:** verify Ctrl + W under pointer lock before any Ctrl binding.~~
   **Answered (BR, 2026-10-04):** no Ctrl or Cmd, ever.
3. **Press-and-hold for long uses:** confirm as the rule for every long use (eat,
   drink, bandage, read, reload), with release before completion cancelling and
   nothing applied?
4. ~~**Reload:** R when ready (overloaded with rest), or its own key?~~
   **Answered (BR, 2026-10-04):** R only reloads, and rest has no key.
5. **Continue after an interruption:** keep C (crouch elsewhere), or make the
   interruption card a two-button choice clicked with the drawn cursor, freeing
   C? Recommendation: the clickable choice, per INTERFACE.md's interruption row.
6. ~~**Debug keys:** panel-only shortcuts, or a prefix?~~ **Answered (BR,
   2026-10-04):** behind a held F1.
7. **Stow on the held slot's key:** confirm pressing the held item's slot puts it
   away?

## Next steps

1. BR rules on the open questions; this document becomes `active`.
2. One implementation item: every input read from the binding table; left click
   and hold as specified; the quickbar change; the debug-key move; a guard test
   that no module outside the table names a `code` literal; the help list and
   hints generated from the table.
3. Slice 3 verbs are added to the table as they land, against this map.
