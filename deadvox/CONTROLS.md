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
  readies a weapon; left click strikes or shoots only while ready; a middle click
  or Shift toggles hip and sights while a firearm is ready; ready caps speed at a
  hurried march; right mouse plus S blocks melee.
- **F interacts; Q and E are reserved (BR, 2026-09-27).**
- **F9 is the main menu; F10 belongs to the browser (BR, 2026-09-28).**
- **Left click uses what you hold**, direction rather than a ruling (BR on
  issue #27, 2026-09-28): "hold the flashlight in hands, then left-click to
  activate (left-click generally means - do the thing with the thing you're
  holding)". BR held the details back for this design.
- **Long uses could be press-and-hold (BR, 2026-09-28)**, direction rather than a
  ruling: holding left click performs a long use, and releasing it early
  cancels.

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
| Ctrl + W, Ctrl + T, Ctrl + N, Ctrl + Q | Browser shortcuts that pages generally can't prevent outside fullscreen with the Keyboard Lock API. With Ctrl as any held modifier, W's key repeat while walking arrives as Ctrl + W: the tab closes | **verify**; if true, rules out Ctrl as a modifier and as crouch |
| Ctrl + click on macOS | The OS treats it as a secondary click; unknown whether that still holds under pointer lock | **verify** |
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
| Use held item: light on/off | now (via the quickbar's second press) | instant |
| Use held item: eat, drink, bandage | now (same) | long |
| Cancel handling | now | instant |
| Rest, sleep, stop, continue after an interruption | now | long, state |
| Melee strike | now (left click, unreadied) | instant, noise |
| Main menu | now | menu |
| Ready a weapon, block | Slice 3 (ruled) | stance |
| Hip / sights toggle, shoot | Slice 3 (ruled) | stance, noise |
| Reload, check magazine | Slice 3 | long |
| Crouch | Slice 3 (sight and noise when crouching) | stance |
| Throw (flare, glowstick, lure) | Slice 3 | instant, noise |
| Put the held item away (stow) | implicit today | instant |
| Swap hands, use the off-hand item | open (#27) | instant |
| Read a book, craft, repair | Slice 2 | long, menu |
| Lean | reserved (Q, E) | stance |

## Proposed map

Shipped profile. The development profile adds the debug keys (see "Debug keys"
below).

| Input | Unready | Weapon ready | Menu open | During a long action | Interruption shown |
| --- | --- | --- | --- | --- | --- |
| W A S D | move | move, capped at a hurried march; S backs off (block with right mouse) | menu navigation where it has any, otherwise nothing | nothing (the action holds you) | nothing |
| Mouse | look | aim | drawn cursor | look | look |
| Left click, tap | use the main-hand item's instant use (light on/off). A weapon: nothing, and the hand shifts its grip as a cue | strike / shoot | click under the drawn cursor | nothing | nothing |
| Left click, hold | long use of the main-hand item (eat, drink, bandage, read); releasing early cancels, nothing applied | — | drag | keep holding | — |
| Mouse 5 (side forward button) | use the left-hand item's instant use (light on/off); nothing if the left hand is empty or has none | same | — | — | — |
| Right mouse, hold | ready the main-hand weapon; with nothing to ready, nothing | stays ready | — | — | — |
| Middle click | — | toggle hip / sights | — | — | — |
| Shift | sprint | toggle hip / sights | — | — | — |
| Space | jump | jump | — | — | — |
| Z | walk / jog toggle | — | — | — | — |
| C | crouch toggle (Slice 3) | crouch toggle | — | — | continue |
| F | interact with what's outlined | interact | — | — | — |
| R | rest; again stops | reload (Slice 3) | rotate while dragging | stop resting | — |
| L | sleep; again stops | — | — | stop sleeping | — |
| X | cancel handling | cancel | cancel handling | stop | stop |
| 1–5 | take the slot's item into your hands; pressing the held item's slot puts it away | same | assign the selected item to the slot | — | — |
| Tab | inventory | inventory | close inventory | — | — |
| F9 | main menu | main menu | close | main menu | main menu |
| Q, E | lean (reserved) | lean | — | — | — |
| G | throw the held throwable (Slice 3) | — | — | — | — |

Notes on the proposal:

- **Quickbar second press** (issue #27's FM-6): pressing the slot of the item
  already in your hands puts it away instead of using it. Use moves to left click
  only, so there's one way to use an item and it's visible.
- **R is overloaded by state** (rest when unready, reload when ready, rotate while
  dragging). Each state is visible (weapon raised, a drag in progress). If that
  reads as too much, reload moves to a key of its own; see open question 4.
- **C is overloaded**: crouch in play, continue on an interruption card. The card
  is on screen when C means continue, which satisfies principle 1, but it's the
  weakest overload in the map. Open question 5.
- **Crouch on C, not Ctrl**, whatever the Ctrl verification finds, because of
  the Ctrl + W risk.
- **An unreadied left click on a weapon does nothing** except a small grip cue.
  Today it swings (`play.ts:755-763`, any left click swings the melee weapon).
  Under the ruled ready stance that changes.

## The two hands (issue #27, open)

**Adopted for now (BR, 2026-10-01): option B, an off-hand control, with Mouse 5
(the side forward button) as the off-hand use.** Mouse 4 (side back) is left
unbound; both side buttons are browser history keys, so the game cancels their
default. Customisable key binds are planned later, which will let the control move.

deadvox has a left and a right hand (`HOLD.left` / `HOLD.right` in
`src/render/hands.ts`); DayZ, the reference for "left click uses", has one active
item. Options:

- **A. Main hand only, plus swap.** Left click always uses the right hand (or the
  two-handed item). A swap key exchanges the hands' items; the off-hand flashlight
  is used by swapping, or it's switched on before a weapon is taken. Simple and
  unambiguous; slower at night.
- **B. Off-hand key.** One key uses the left-hand item's instant use (the light).
  No modifier and no hidden state; costs one key. Candidate: a key near WASD that
  the map leaves free in play (V or T, both debug-only today; see "Debug keys").
- **C. Modifier + left click** (BR's suggestion). Needs a safe modifier: Shift is
  sprint and sights, Alt is unsafe in Firefox and window managers, Ctrl depends on
  the Ctrl + W verification. If Ctrl is safe, C is compact; if not, there's no
  good modifier left.
- **D. Lights are special.** A light in either hand has its own on/off key
  (a "light" verb, like a headlamp switch), and left click stays main-hand only.
  Covers the case that raised #27 without a general off-hand mechanism.

Recommendation: **B**, with the key chosen after the debug keys move (below). It
satisfies principles 1 and 2, needs no modifier, and extends to other off-hand
items with an instant use. D is the fallback if the off hand never holds anything
but lights.

## Debug keys

The development profile binds B, G, H, K, N, P, T, U, V and Backquote
(`src/debug/index.ts`). In play, these letters are free in the shipped game but
taken in the development and playtest builds, which is where the controls get
tested; a shipped verb on V would collide in every test session. Proposal: debug
actions stay reachable from the debug panel (Backquote) and keep single-key
shortcuts only while the panel is open, or move under one prefix (Backquote then
a letter). That frees the letters for shipped verbs.

## Open questions for BR

1. **The two hands:** A, B, C or D? Recommendation: B.
2. **Ctrl:** verify Ctrl + W under pointer lock in Chrome and Firefox before any
   Ctrl binding. If the tab can close, no Ctrl bindings at all. Recommendation:
   treat Ctrl as unusable until verified.
3. **Press-and-hold for long uses:** confirm as the rule for every long use (eat,
   drink, bandage, read, reload), with release before completion cancelling and
   nothing applied?
4. **Reload:** R when ready (overloaded with rest), or its own key?
   Recommendation: R when ready; rest isn't available while ready anyway.
5. **Continue after an interruption:** keep C (crouch elsewhere), or make the
   interruption card a two-button choice clicked with the drawn cursor, freeing
   C? Recommendation: the clickable choice, per INTERFACE.md's interruption row.
6. **Debug keys:** panel-only shortcuts, or a prefix? Recommendation: panel-only.
7. **Stow on the held slot's key:** confirm pressing the held item's slot puts it
   away?

## Next steps

1. BR rules on the open questions; this document becomes `active`.
2. One implementation item: every input read from the binding table; left click
   and hold as specified; the quickbar change; the debug-key move; a guard test
   that no module outside the table names a `code` literal; the help list and
   hints generated from the table.
3. Slice 3 verbs are added to the table as they land, against this map.
