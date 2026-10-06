---
read_if:
  - you're authoring or changing readable item or furniture content
  - you're changing how authored readings enter play
  - you're changing movement or action input while a readable is open
---

# Authored notes and signs

Items and furniture share the optional, strict `readable` block:

```json
"readable": {
  "title": "Evacuation note — PLACEHOLDER",
  "text": "PLACEHOLDER ONLY\n\nWrite the actual message here later."
}
```

**Read wins over Eat/Switch:** do not combine `readable` with `food` or `light`.
This authoring constraint is documented, not a new validation rejection.

Each distinct authored note/logbook is its own item type (normally `category: "book"`);
each distinct sign is its own furniture type. Copies of a type share its immutable
text. Item/furniture saves retain the existing type reference, not duplicated text
or reading progress. There is no runtime editing or per-instance message state to
justify another save format. The view itself is transient, not saved.

## Authoring rules

- Both fields must be strings with non-whitespace content.
- Plain text only: reject `<`, `>` and ASCII controls other than tab, LF and CR
  (DEL is also rejected). Newlines and blank lines preserve paragraphs. Ampersands
  and entity spellings such as `&copy;` remain literal text, not HTML.
- Title: at most **120 UTF-16 code units**; body: at most **12,000**. Both limits
  include whitespace. Unknown readable fields are rejected.
- `npm run validate` reports the owning item/furniture and field path. The Lit view
  renders text nodes, never authored HTML.

**No pages:** one scrollable body handles the playtest paragraphs and a short
logbook without page metadata, navigation/state or repeated controls. The body
cap is enough for roughly a couple of thousand ordinary words. Pages do not pay
for themselves for the current beats.

Place a sign through the existing template furniture pieces; give a note through
an ordinary loot entry, starting item or item placement. A readable sign needs no
container or loot. Runtime F priority remains **door → readable → container**.
A hybrid readable/container presents reading through F; inventory access remains
ordinary inventory access. The shared block does not change door ownership.

## Player flow and time

Take a readable-only note into a hand and hold its assigned quickbar slot. An
item with a book component also supports its held primary action; see
`src/game/primaryAction.ts`, `primaryActionForDefinition`. The inventory Read command was removed under BR's
interaction ruling in `CONTROLS.md`. A quickbar tap only takes or puts away;
holding its slot uses the note while it is in hand (`src/game/quickbarActions.ts`,
`QuickbarActions.hold`).
`src/core/options.ts`, `useOption`, describes the capability;
`src/game/survival.ts`, `Survival.use`, revalidates hand ownership and owns the
read effect. Reading a readable-only note neither consumes nor changes the item
and admits no handling job. Opening paper has **zero command time**; time spent
actually reading already passes in the live world.

Look at a sign and press F. Normal furniture picking includes gaze/occlusion and
Search's reach; the session command rechecks the live entity identity and reach.
Moving away or passing a stale entity does not open the view.

The parchment-styled reading surface is not a new HUD panel. It takes focus, wraps
text and scrolls with wheel, arrows, Page Up/Down, Home/End or Space. Wheel routing
uses the existing scroll-pane/menu-pointer implementation. **Esc, Tab or Put away**
close it and restore previous focus. F9 opens the main menu and puts it away;
pointer-lock loss and death also close it. Other gameplay, inventory, quickbar and
primary-action keys do not leak through. The world **keeps moving**, just as with
inventory; movement/action input is inactive. BR's d73-2 long-action ruling is "long
actions disable all actions"; `src/core/longAction.ts`, `LongActions`, owns the
timed book action that may continue while its separate paper surface is open.
`src/ui/reading.ts`, `mountReading`, retains the surface's close and scroll keys.
Main-menu/pointer-loss pause rules are unchanged. This does not add or enable the
HUD: existing HUD preferences and compass/watch item plans remain unchanged.

A book may define both `book` and `readable`. `book` supplies the timed
recipe-learning action; `readable` supplies authored prose for the paper surface.
`Survival.use` starts the book action and then opens that text, so the visible
handbook text is not an action-progress view. Closing the surface dismisses only
the presentation; the long-action owner remains responsible for the book job and
its progress.

The maintained browser contract exercises the real sample pickup/search/handling/
quickbar-held Read path, sign F interaction, input ownership, focus, scrolling and
dismissal.
It also checks maximum title/body sizes at 360×640 and 800×600 (20 px body text,
no horizontal overflow, footer/button visible).

## Prototype samples, not lore

`readables.json` defines `sample_note`, `sample_sign` and guaranteed
`sample_note_loot`. `?site=testHouse&seed=1&radius=16&time=12:00` places the sign near
spawn and the note in the table-designated test-house crate.
`sample_note` is intentionally outside the authored closure and listed unreachable;
this procedural test-house table is not a final playtest loot placement. The note's 5 g weight and one-cell inventory
footprint are prototype estimates; its held/piled model remains the ordinary
fallback, not a bespoke paper mesh.

The samples loudly say **PLACEHOLDER / NOT PLAYTEST LORE** and remain separate
from the authored progression. `items-playtest.json` and `furniture-playtest.json`
provide d99-1's evacuation note, two signs and hunter's logbook. BR approved the
note and logbook texts as written on 2026-10-06 at 14:43 (#181); the signs also
have approved text. `layouts-playtest.json` places them in the beats 1–3 site.

## Reading in darkness: report-only

**Yes for a cheap, coarse gate; no for accurate local illumination already today.**
A domain-owned predicate could combine core sky visibility at the player's eye,
core sky intensity and charged/on held-light state. It must build/cache the core
volume on the simulation side and fingerprint those inputs, not call the renderer's
camera-residency-dependent `Skylight.at()`. Outside authored fields, fail open. That is an approximation, not photometric lux
or a flashlight-beam/occlusion test; direct sun and arbitrary scene lights need more
work. Current daylight-only adaptation cannot reliably recognize buried darkness.
No darkness gate is implemented here. BR still chooses a threshold and how the
crafted light should pay off in beat 3.
