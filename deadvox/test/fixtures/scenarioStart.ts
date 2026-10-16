import type { Vec3 } from '../../src/core/coords.ts';
import { ladderOutward } from '../../src/core/ladders.ts';
import type { ScenarioRouteSpace } from '../../src/core/scenarioRoute.ts';
import type { ScenarioStart } from '../../src/core/scenarioStart.ts';
import { IDLE, type Session } from '../../src/game/session.ts';

function assert(condition: unknown, message = 'Roof traversal invariant failed'): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export const leaveRoof = (
  session: Session,
  space: ScenarioRouteSpace,
  start: ScenarioStart,
  controls: {
    intent: (value: typeof IDLE) => void;
    yaw: (value: number) => void;
    frame: () => void;
    blockSize: number;
  },
): Readonly<Vec3> => {
  const descent = start.descents.find((entry) => entry.kind === 'ladder');
  assert(descent?.kind === 'ladder');
  const bottom = session.entities.at(...descent.ladder);
  assert(bottom);
  const [ox, oz] = ladderOutward(bottom.facing);
  const approach: Vec3 = [
    bottom.pos[0] + bottom.size[0] / 2 - ox,
    descent.upper[1],
    bottom.pos[2] + bottom.size[2] / 2 - oz,
  ];
  const walk = (from: Readonly<Vec3>, to: Readonly<Vec3>) => {
    const route = space.path(from, to, { placement: start.placement });
    assert(route, `no roof route from ${from} to ${to}`);
    for (const point of route) {
      const distance = () => Math.hypot(session.body.pos[0] - point[0], session.body.pos[2] - point[2]);
      const frames = Math.ceil((distance() / 2 + 2) * 60);
      controls.intent({ ...IDLE, forward: 1, walk: true });
      for (let n = 0; n < frames && distance() > 0.04; n++) {
        controls.yaw(Math.atan2(session.body.pos[0] - point[0], session.body.pos[2] - point[2]));
        controls.frame();
      }
      controls.intent({ ...IDLE });
      assert(distance() <= 0.04, `roof walk stopped at ${session.body.pos}`);
    }
  };
  walk(start.spawn, approach);
  const [top] = [...session.entities.all]
    .filter(
      (entity) =>
        session.entities.defOf(entity).climbable &&
        entity.pos[0] === bottom.pos[0] &&
        entity.pos[2] === bottom.pos[2] &&
        entity.pos[1] < descent.upper[1],
    )
    .sort((a, b) => b.pos[1] - a.pos[1]);
  assert(top);
  assert(session.grabLadder(top) === undefined);
  controls.yaw(Math.atan2(-ox, -oz));
  controls.intent({ ...IDLE, forward: 1, walk: true });
  const travel =
    ((descent.upper[1] - descent.lower[1]) * controls.blockSize) /
    session.entities.defOf(top).climbable!.speedMetresPerSimSecond;
  const landed = () => session.body.onGround && Math.abs(session.body.pos[1] - descent.lower[1]) < 0.1;
  for (let frame = 0; frame < Math.ceil((travel + 3) * 60) && !landed(); frame++) {
    controls.frame();
  }
  controls.intent({ ...IDLE });
  assert(landed(), `roof descent stopped at ${session.body.pos}`);
  const centre: Vec3 = [bottom.pos[0] + bottom.size[0] / 2, descent.lower[1], bottom.pos[2] + bottom.size[2] / 2];
  walk(centre, descent.lower);
  return descent.lower;
};
