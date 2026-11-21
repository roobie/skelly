---
read_if:
  - you review terrain repair or rubble clearing by eye and by play
  - you change the cell-work fixture
---

# Cell-work look

Enable this start mod and choose its start, or open
`/?start-mod=skelly.deadvox.scenario.test-house.rubble-look#{debug:true}`.
The start beside the cracked brick and rubble carries the repair kit and supplies,
knows the repair recipes and has maximum skills; see `starts.jsonnet` and
`layouts.jsonnet`.

## By-eye checks

- Hold interact on the cracked brick. Repair opens the shared world-work review,
  with requirements and condition bands, not a terrain screen. Looking elsewhere
  must not change its target.
- Start the repair. The review closes, supplies are spent and the tool stays.
  The crack disappears when the repair completes. A cell at its ceiling offers
  no further Repair.
- Aim at neighbouring rubble and hold interact. Take apart opens the same review
  with yield and duration. Start clears the heap cell and leaves its yield at
  the feet.
- Close either review without starting: no work or supply consumption occurs.
  Replacing or losing the reviewed cell discards the review rather than selecting
  another cell of the same kind.

The lone-entry interaction rule opens a review directly; it does not require an
extra ring-selection gesture. See `packages/engine/src/game/actionMenu.ts`,
`ActionMenu.open` (repo root).
