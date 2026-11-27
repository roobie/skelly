---
read_if:
  - you check gravity-drop presentation or partial body reveal while digging by eye
  - you change the fall-drop fixture
---

# Fall-drop look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.fall-drop-look#{debug:true}).

The start stages a crate carrying a loose can on a raised deck, beside a timber post and overhanging beam. The fixture kit supplies tools and maximum skills, so the check needs no training or stock gathering.

- Break the deck plank directly beneath the crate using the debug build tool's terrain strike, from beside the deck edge. The crate must drop straight down: its falling copy is the only visible crate until impact, and the loose can falls on its own, in lockstep, without a second can waiting at the landing. Pushing the crate sideways instead leaves the can in its original column, so that is not the lockstep check.
- Beside the deck, break the isolated timber post's lowest cell using the debug build tool's terrain strike. Watch the post and overhanging beam cascade. Each falling block keeps its source appearance; rubble appears only on impact, never floating beneath an unfinished drop. Later landings must not expose earlier masked cells.
- In the concrete pit east of the timber props, a shambler starts trapped beneath two rubble cells. Take apart only the upper rubble cell: part of the body must show through the opening while the lower rubble still covers the rest. Clear the remaining cell to finish exposing it. During the initial collapse, the body must not show through rubble whose drop has not finished.
- Save during a fall in a save-enabled run, then reload. The settled world must have no missing blocks or persistent hidden pieces.

The reasons are in `packages/deadvox/DESIGN.md`, "Moving furniture".
