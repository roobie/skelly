---
read_if:
  - you're implementing or reviewing the body-point clamp (#1817), or a camera, held item, held light or shot ends up inside a wall
  - you add a point that rides the body ahead of its collision box, or a pose that moves one
  - you add something that starts in the world from the body, such as a shot, a throw or a cast
  - you change the ADS camera wall check, the lean wall check or their margins
  - you're choosing a free-space query for the voxel world, or wondering why the engine has no shape cast
---

# Body points kept out of walls

## Status

This is the accepted design for #1817. One generic mechanism keeps every point that rides
the body out of walls, with no fix per pose. Its shape, its home, its margins and the four
behaviours under "Settled behaviour" are rules, not options. The simulated eye, the throw
origin, the shot origin and the held items with their lights are clamped. The camera waits
on #1817, and when it lands it trims this doc to its reasons and code cues.

The issue calls these points body attachments. This doc says body point, because
attachment already names a firearm's fitted parts and a figure's gear frames; a third
meaning would make every search ambiguous.

## Why the points escape

Only the collision box is kept out of solid cells, and it follows the stance's height,
not the pose; see `packages/engine/src/core/physics.ts`, `stepBody`, and
`packages/engine/src/game/session.ts`, `settleStance`. Everything a player sees and acts
from is a posed offset from that box:

- **The eye** is the figure's anatomical eye carried through the stance, look and lean
  pose, so a forward-leaning torso carries it ahead of the box. See
  `packages/engine/src/core/playerLookPose.ts`, `playerLookPose` and `playerEyePosition`,
  and `packages/mods/skelly.body/figures-player.jsonnet`, `stancePoses`, whose comment
  records that collision deliberately does not follow the pose. Lying prone carries the
  eye furthest, so the crouch in the issue is the mild case.
- **Everything the simulation does from the eye** inherits it: the interaction pick,
  the melee origin, the throw origin, the reading light and the eye a firearm is
  seated from. They share one owner, `packages/engine/src/game/session.ts`, `playerEye`.
- **The muzzle** is the eye plus the held firearm's transform, and it is the shot's
  origin; see `packages/engine/src/game/firearmAim.ts`, `firearmBoreRay`, and
  `packages/engine/src/game/firearmHandling.ts`, `FirearmMechanics`. A long barrel
  pressed to a thin wall therefore starts its shot on the far side. The issue does not
  list this, and it is the one case here that changes an outcome rather than a picture.
- **The camera** is the view's own evaluation of the same eye, plus a step-smoothing
  offset and the ADS camera offset. See `packages/presentation/src/presentation/play.ts`,
  `heldBodyPose`, and `packages/presentation/src/render/playView.ts`, `updateCamera`.
- **The held item, its arms and its light** hang from a frame placed at the eye, and a
  lamp shines from its drawn model. See `packages/presentation/src/render/playerFigure.ts`,
  `PlayerMeshes.lightPositionOf`, and `packages/presentation/src/render/lightPool.ts`,
  `LightPool.update`. A lamp inside a wall is then hidden by the picture's own wall
  check, working as designed from the wrong side (`DESIGN.md`, "Light").

Two points already had a fix of their own, which is the pattern the maintainer's rule
ends: lateral lean is limited by `packages/engine/src/core/lean.ts`, `guardLean`, and the
ADS camera is pulled back by `packages/engine/src/core/adsView.ts`, `guardAdsCamera`.

What the simulation senses of the player is already safe, because it is measured on the
box's centre line: see `packages/engine/src/game/session.ts`, `playerSense`. So the held
lamp's bug is in the picture alone, and the crouched eye's is in both.

## The mechanism

A body point is cleared by sweeping from an anchor inside its body's collision box to the
point's posed position, and stopping where the sweep would first touch a solid cell. The
anchor is on the box's centre line at the point's height, held inside the box's own
height. The box is what collision keeps clear, so the anchor needs no search and no
history: the answer is a pure function of the body, the posed point and the world, which
is what lets the simulation use it (`docs/decisions/0008-deterministic-world.md`, "Decision").
See `packages/engine/src/core/bodyPointClearance.ts`, `clearBodyPoint`.

Five rules give it its shape.

- **Sweep a volume, not a ray.** `packages/engine/src/core/raycast.ts`, `raycast`, is the
  only free-space cast the voxel world has, and it has no thickness. A margin taken back
  along a ray shrinks with the angle of approach, so a view that meets a wall obliquely
  keeps almost none of it and the near plane cuts through. The sweep moves a small
  axis-aligned cube whose half-extent is the point's margin. Against axis-aligned cells
  that is exact, cheap and free of tolerances, and the cube bounds the sphere a margin
  means. It sits beside `raycast` as a second world query, not inside the clamp; see
  `packages/engine/src/core/raycast.ts`, `sweepCube`.
- **Not Rapier.** The engine reaches no physics library: Rapier serves ragdolls in
  presentation only, and its build for the simulation is a decision without a consumer
  until #1689 (`docs/decisions/0009-rapier-f64-build.md`, "Decision").
  The voxel grid is also the collision truth for bodies, and a second wall model would be
  a second truth to keep equal.
- **Ask the question the body's collision asks.** The anchor is only guaranteed clear
  against the solidity the box was stepped against. A body standing in a window opening
  is the case where a cell-level answer differs; see
  `packages/engine/src/core/apertureCollision.ts`, `apertureShapes`. A sweep that finds its
  own start blocked returns the anchor, never the posed point: failing closed puts the
  point on the centre line, where the worst case is a dull view rather than an open wall.
  Debug noclip switches the clamp off with the rest of the body's rules. See
  `packages/engine/src/game/session.ts`, `clearPlayerPoint`.
- **One pull-back per rigid group.** Points that are drawn or reasoned about as one rigid
  thing move together: the view (eye, then camera), and each held item with its fitted
  parts, muzzle and light. Clamping each point alone would detach a lamp's glow from the
  lamp and a shot from its gun, both of which `DESIGN.md`, "Hands: what you see is what's
  there" and `docs/decisions/0006-firearm-handling.md`, "Decision" forbid. A group moves
  back along its own sweep line by what its lead point needs.
- **It takes a body, not the player.** Nothing in it is about the player's figure, so a
  spitting actor's posed mouth can become a consumer without a second mechanism; see
  `packages/engine/src/core/actorSystem.ts`, `spitOrigin`. #1817 wires the player only,
  because the spit already refuses a blocked line.

## Where it lives

The sweep and the clamp are engine code. Presentation calls the same functions for the
points only it knows, as it already calls the engine's pose and bore functions to draw
what the simulation computed. One mechanism with two callers keeps the boundary in
`DESIGN.md`, "Simulation architecture" and `../../docs/decisions/0009-content-defined-products.md`,
"Package boundaries": the engine never learns about a camera or a drawn model, and no
picture-only value reaches the simulation.

**The simulation's points, in the engine.** These decide outcomes, so they must not
depend on a frame, a window size or a drawn model.

- The eye is clamped once, in its owner, so every pick, strike, throw and reading check
  that starts from it is fixed together. The view's eye must come from the same clamped
  function at the view's look, or the affordance and the press would pick from different
  points; see `packages/presentation/src/presentation/play.ts`, `interactionTargetAt`.
- The shot origin is clamped after the bore is placed, keeping the bore's direction. A
  muzzle that does not fit therefore fires into the near face of what blocks it. It takes
  the held item's margin, because the muzzle is the gun's lead point and the drawn gun is
  pulled back by the same clamp. See `packages/engine/src/game/firearmAim.ts`, `clearedBore`.
- A throw's origin adds a hand offset to the eye and gets the same clamp; see
  `packages/engine/src/game/commandRouter.ts`, `itemThrowFlight`.
- A cast has no producer of its origin at the time of writing: the event carries one and
  resolution only checks that it is finite. See `packages/engine/src/core/castRules.ts`,
  `CastRuleEvent`. Whatever comes to build that event for the magic mod (#313) takes its
  origin from the clamped point, so a spell cannot start inside a wall either.

**The picture's points, in presentation.** These change nothing the simulation reads.

- The camera is swept from the same anchor to its final position, after the step offset
  and the ADS offset are added. This replaces `guardAdsCamera` and the guard in
  `packages/presentation/src/render/playView.ts`, `adsCameraTarget`: an ADS offset is one
  more reason the camera's posed position moved, not a case of its own. The spectator and
  third-person cameras keep their own placement.
- A held item is pulled back before its arms are solved, so the arms fold to the grip the
  way they follow every other hold, and anatomical shoulders stay put. Its light and beam
  need no clamp of their own, because they are read from the drawn model after it moves.
  For a firearm the pull-back is the one the simulation applied to the muzzle, computed by
  the same function, so the shot still leaves the drawn gun. The first-person figure copies
  the world figure's pose, so only the world figure is pulled back. See
  `packages/presentation/src/render/actorAnimator.ts`, `pullHeldClear`.

Lean keeps its own guard. It limits a pose amount that the simulation carries between
ticks and tests the head and torso as boxes, which keeps the drawn body out of cover; the
point clamp moves points and never the body, so it cannot replace that.

## Margins are content

A margin is how far from a wall a point must stay, which is a judgement about look and
feel, so content owns it (`PILLARS.md`, "Content forward compatibility").

- **Home:** the figure row's `clearanceMetres`, one margin per body-point role (the
  simulated eye, a held item, an origin), beside the camera wall margin it supersedes. See
  `packages/engine/src/core/schema/figures.ts`, `FigureSchema`, and
  `packages/mods/skelly.body/figures-player.jsonnet`. The points are that figure's
  anatomy and holds, both packages already read the row, and another body plan then
  brings its own margins without a code edit. The lean margin stays with lean in
  `packages/engine/src/core/schema/player.ts`, `PlayerSchema`.
- **Checked at load:** a margin must fit inside the body it is anchored in, or the anchor
  is not guaranteed clear. That is a cross-row check on the shared validation boundary,
  an error and not a clamp; see `packages/engine/src/core/content.ts`,
  `checkPlayerClearance`. The body is the player's lowest stance, since every stance
  anchors points.
- **The camera's margin is derived, plus an authored pad.** What the near plane needs is
  geometry: the distance to its far corner, from the near distance, the field of view and
  the window's shape. Code owns geometry, and the window's shape is not content, so an
  authored number could only be right for one window. The near distance and field of view
  stay where they are, in `packages/engine/src/core/schema/graphics.ts`,
  `GraphicsTuningSchema`. The simulated eye cannot use a derived margin, because no window
  may reach the simulation, so it has its authored one and the camera is swept again.

## Alternatives weighed

- **A bigger collision box.** It needs no new mechanism and would cover third-person too.
  But the box is axis-aligned and cannot grow forward only, so it would grow all round by
  the furthest reach of any pose and any held item. That closes the low and narrow routes
  crouching exists for (`DESIGN.md`, "Crouching and lying prone"), and a rifle would still
  reach past it. It also changes with whatever is held, which makes doorways depend on
  the hands.
- **Pushing the body back.** Treating the points as part of collision is the most
  physically honest answer and keeps the drawn body out of the wall as well. Its cost is
  that movement starts to depend on the look: turning with a long gun beside a wall would
  stop or shove the player, looking down near a wall would move them, and every pose
  change becomes a collision event that can fail. It makes the box a function of pitch,
  aim and inventory in the deterministic step, and it is the per-pose work the rule
  rejects, moved into physics.
- **Drawing the held item as an overlay.** A viewmodel drawn over the world can never be
  cut by a wall, and it is the cheapest fix for the held item's look. It is refused by a
  standing rule: held and worn things are world geometry that reads the same in every
  view (`DESIGN.md`, "Rendering"), and first person observes the one world body
  (`docs/decisions/0006-firearm-handling.md`, "Decision"). It also fixes neither bug in the
  issue: the lamp's light and the shot would still start inside the wall, and the eye is
  not a viewmodel.
- **Limiting the pose instead of the points,** as lean does. It keeps the drawn body
  honest, but each pose axis needs its own solve (crouch lean, look-down lean, prone,
  aim, emotes), which is the per-pose list again.

The point clamp is chosen because it is the only one that covers every point, in the
simulation and the picture, without changing how the body moves or what fits through a
door. Its known cost is that it corrects points and not the drawn body: a head or torso
can still stand in a wall where another viewer could see it, and a camera pulled far back
can look at its own body from inside. The first waits on a body shape that covers the
posed figure, which starts with prone (#1820); the second is what the look below judges.

## Settled behaviour

Four cases are taste and scope, which the mechanism alone does not decide.

- **A held item that does not fit slides straight back toward the body.** One rule then
  serves every item, with nothing to author for each. An authored blocked pose, muzzle up
  or down, would read better but is a pose family per item, which is the per-pose work
  the one-mechanism rule ends. The accepted cost is that a long gun's stock passes into
  the torso when pressed hard against a wall.
- **A blocked gun still fires, and hits what blocks it.** The shot leaves the clamped
  muzzle along the bore, so the outcome is what the picture shows and the player has no
  refusal rule to learn. Refusing the shot would add a state that only walls cause.
- **Prone is accepted as the look shows it.** The clamp keeps a prone player's points out
  of walls, but its pull-back is the largest of any stance, because the box does not
  cover a lying body. Covering it changes what a prone body fits through and how it
  turns, which the clamp deliberately leaves alone, so that body shape waits for #1820.
- **Melee swing arcs are out of scope.** A swing is a motion, not a point that rides the
  body, so a blade can still pass through a wall for a moment in the picture. The
  strike's reach already has its own blocker, so no outcome is wrong.

## The look

Both checks use the windowless partition room the carried-lamp looks already build, whose
back room is dark only because a one-cell partition walls off the daylit front room; see
`mods/skelly.deadvox.scenario.test-house.carried-lamp/templates.jsonnet`,
`test_house_carried_lamp_room`. A thin wall between dark and daylight makes either fault
unmistakable: a clipped eye shows the bright room, and a swallowed lamp turns the dark
room black. Each is a start mod built on `tools/jsonnet/lib/start-kit.libsonnet`,
`fixture`, with its own site row that stands the tester an arm's length from the
partition, facing it, by the pattern in
`mods/skelly.deadvox.scenario.test-house.carried-lamp/layouts.jsonnet`, `site`
(`docs/PROCESS.md`, "Reviews by eye and by play").

- **Crouch look,** `mods/skelly.deadvox.scenario.test-house.crouch-wall-look/starts.jsonnet`,
  `crouchwalllook`. A long gun in hand with its ammunition pocketed, since a start cannot
  hand over a loaded weapon until #1570. The tester crouches and walks into the
  partition, looks up and down, turns against it and backs into the corner, then does the
  same prone. The wall must stay shut at every angle, and the view must not show the
  inside of the tester's own body; what prone shows beyond that is accepted until #1820.
  The shotgun's barrel must stop short of the partition rather than sink into it, and
  firing with the muzzle pressed to the partition must mark the near face. A start row has no stance field and one is not worth adding for a
  single key press.
- **Lamp look,** `mods/skelly.deadvox.scenario.test-house.wall-lamp-look/starts.jsonnet`,
  `walllamplook`. A lit oil lamp in hand and the same lamp lit on the floor for comparison,
  from `mods/skelly.deadvox.scenario.test-house.carried-lamp/carried-lamp.libsonnet`,
  `start`, at the crouch look's spot. The tester walks the lamp into the partition and
  along it. The room must stay lit, the lamp must stay visible in the hand, and the arm
  must fold without breaking.

## Tests

Each protects one behaviour that is costly to rediscover, on its own small fixture world,
and asserts a property: no margins, coordinates or distances (`AGENTS.md`, "Tests").

- **The sweep stops short of a wall it meets at a grazing angle.** This is the invariant
  a ray lacks, and it is a reach rule, so it carries the one mutation proof: the same
  case with the sweep replaced by a ray and a margin along it.
- **A point whose posed position is clear beyond a thin wall stays on the body's side.**
  The sweep decides, not the endpoint; the lean guard's own test of that idea stays with
  lean (`packages/engine/test/leanCollision.test.ts`).
- **A point with a clear sweep stays where the pose put it,** so the clamp cannot become
  a constant pull-back.
- **A sweep that starts blocked returns the anchor.**
- **A lowered player pressed to a wall has a simulated eye with no solid cell within its
  margin,** across a covering array of stance and pitch rather than every pair. It is
  the eye's bug-fix test, failing before the eye is clamped.
- **A shot with the muzzle pushed through a thin wall hits that wall's near face.** This
  is the muzzle's bug-fix test, failing before the shot origin is clamped.
- **A throw whose hand offset swings past a thin wall releases and lands on the
  thrower's side.** It fails without the throw-origin clamp, since the eye's own clamp
  does not cover the hand offset added after it.
- **Content with a margin wider than its body is rejected.** A plain validation row, no
  mutant.
- **The camera's near-plane corners stay out of solid cells when the view meets a wall
  obliquely,** as a pure placement test with no browser.
- **A held lamp's light stays on its holder's side of a wall,** on the figure without a
  renderer.

No browser stage is added: the faults are judged by eye in the looks, and the properties
above are provable without pixels. One existing test goes with `guardAdsCamera`, and the
thin-wall and near-plane tests above catch what it protected:
`packages/engine/test/adsView.test.ts`, "pulls the ADS camera back along its body-eye segment before crossing solid geometry".
The
margins are tuned by eye, so they get rows in `../../docs/deferred-assertions.md` rather
than assertions. The simulated eye moves, so the simulation digest changes by design and
the round reports both values (`docs/simulation-digest.md`).
