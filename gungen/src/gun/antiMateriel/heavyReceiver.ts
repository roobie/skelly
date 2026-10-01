import { boxFromMinMax } from '../../core/geometry.ts';
import type { KeepOut, PartDef, PartFamily, PortDef, Solid } from '../../core/schema.ts';
import { BMG_CASE_LENGTH_U, ceilTo } from './cartridge.ts';
import { box, choice, NEG_X, NEG_Y, X, Y } from './common.ts';
import { HEAVY_LOWER_REAR_X } from './heavyLower.ts';

/**
 * The action body for the .50 rifle: the shared `receiver`'s box shell and port layout (front face at x = 0,
 * 5u tall and 4u wide, rail on top, the same ports and keep-outs), but long enough for the cartridge. It plays the
 * `receiver` role and takes `action: auto`, `feed: box`, as `bolt-carrier` and the `feed-match` rule read them.
 *
 * Lengths follow the .50 BMG case (cartridge.ts), not the shared receiver's 16u:
 * - the bolt face stands one case length plus 0.25u behind the barrel port, rounded to the grid, so a chambered
 *   round fits in front of it;
 * - the bolt carrier (a 6u block, as `bolt-carrier`'s barrett pattern builds it) rests with its face there and
 *   travels 8u back, which parks its face 2.5u behind the magazine's rear wall, so the next round can rise;
 * - the ejection port is one case length plus 0.25u margins at each end, so a spent case can leave sideways;
 * - the receiver ends 1.25u behind the lower's frame, the margin the shared receiver leaves behind its lower.
 */
const CARRIER_HALF_LENGTH = 3;
const CARRIER_Y = 1;
const BOLT_FACE_X = -ceilTo(BMG_CASE_LENGTH_U + 0.25, 0.25);
const CARRIER_REST_X = BOLT_FACE_X - CARRIER_HALF_LENGTH;
const BOLT_TRAVEL = 8;
const PORT_MARGIN = 0.25;
const PORT_LENGTH = ceilTo(BMG_CASE_LENGTH_U + 2 * PORT_MARGIN, 0.25);
const PORT_FRONT_X = BOLT_FACE_X + PORT_MARGIN;
const PORT_REAR_X = PORT_FRONT_X - PORT_LENGTH;
const PORT_BOTTOM_Y = 0;
const PORT_TOP_Y = 2;

export const HEAVY_RECEIVER_LENGTH = -HEAVY_LOWER_REAR_X + 1.25;
const HALF_HEIGHT = 2.5;
const HALF_WIDTH = 2;
const WALL = 0.5;
const INNER_HALF_HEIGHT = HALF_HEIGHT - WALL;
const INNER_HALF_WIDTH = HALF_WIDTH - WALL;
const RAIL_SLOT_PITCH = 2;
/** The rail starts 1.5u in from the rear face and its last slot sits 2u behind the front face. */
const RAIL_START_X = 1.5 - HEAVY_RECEIVER_LENGTH;
const RAIL_SLOTS = (-2 - RAIL_START_X) / RAIL_SLOT_PITCH + 1;

/** The charging handle rides on the side opposite the ejection port, a carrier-length ahead of the bolt's rest. */
const HANDLE_X: readonly [number, number] = [CARRIER_REST_X + 3, CARRIER_REST_X + 4.5];

export const heavyReceiver: PartFamily = {
  name: 'heavy-receiver',
  params: {
    action: choice('auto'),
    feed: choice('box'),
    bore: choice('L', 'M'),
  },
  build(params): PartDef {
    const rear = -HEAVY_RECEIVER_LENGTH;
    const solids: Solid[] = [
      box('receiver-shell-bottom', [rear, -HALF_HEIGHT, -HALF_WIDTH], [0, -INNER_HALF_HEIGHT, HALF_WIDTH]),
      box('receiver-shell-top', [rear, INNER_HALF_HEIGHT, -HALF_WIDTH], [0, HALF_HEIGHT, HALF_WIDTH]),
      box(
        'receiver-shell-rear',
        [rear, -INNER_HALF_HEIGHT, -INNER_HALF_WIDTH],
        [rear + WALL, INNER_HALF_HEIGHT, INNER_HALF_WIDTH],
      ),
      box(
        'receiver-shell-front',
        [-WALL, -INNER_HALF_HEIGHT, -INNER_HALF_WIDTH],
        [0, INNER_HALF_HEIGHT, INNER_HALF_WIDTH],
      ),
      box(
        'receiver-shell-side-far',
        [rear, -INNER_HALF_HEIGHT, -HALF_WIDTH],
        [0, INNER_HALF_HEIGHT, -INNER_HALF_WIDTH],
      ),
      box(
        'receiver-shell-side-near-rear',
        [rear, -INNER_HALF_HEIGHT, INNER_HALF_WIDTH],
        [PORT_REAR_X, INNER_HALF_HEIGHT, HALF_WIDTH],
      ),
      box(
        'receiver-shell-side-near-front',
        [PORT_FRONT_X, -INNER_HALF_HEIGHT, INNER_HALF_WIDTH],
        [0, INNER_HALF_HEIGHT, HALF_WIDTH],
      ),
      box(
        'receiver-shell-side-near-lower',
        [PORT_REAR_X, -INNER_HALF_HEIGHT, INNER_HALF_WIDTH],
        [PORT_FRONT_X, PORT_BOTTOM_Y, HALF_WIDTH],
      ),
      box('charging-handle', [HANDLE_X[0], 0.5, -3.5], [HANDLE_X[1], 1.5, -HALF_WIDTH]),
    ];
    const ports: PortDef[] = [
      {
        id: 'barrel',
        mount: 'barrel',
        gender: 'female',
        size: params.bore ?? 'L',
        pos: [0, 0, 0],
        normal: X,
        up: Y,
        required: true,
      },
      {
        id: 'bolt-carrier',
        mount: 'bolt-carrier',
        gender: 'female',
        pos: [CARRIER_REST_X, CARRIER_Y, 0],
        normal: X,
        up: Y,
      },
      { id: 'handguard', mount: 'handguard', gender: 'female', pos: [0, 0, 0], normal: X, up: Y },
      {
        id: 'lower',
        mount: 'lower',
        gender: 'female',
        pos: [0, -HALF_HEIGHT, 0],
        normal: NEG_Y,
        up: X,
        required: true,
      },
      { id: 'stock', mount: 'stock', gender: 'female', pos: [rear, 0, 0], normal: NEG_X, up: Y },
      {
        id: 'rail',
        mount: 'rail',
        gender: 'female',
        pos: [RAIL_START_X, HALF_HEIGHT, 0],
        normal: Y,
        up: X,
        slots: { count: RAIL_SLOTS, pitch: RAIL_SLOT_PITCH },
      },
    ];
    const keepOuts: KeepOut[] = [
      {
        id: 'ejection',
        kind: 'ejection',
        box: boxFromMinMax([PORT_REAR_X, PORT_BOTTOM_Y, HALF_WIDTH], [PORT_FRONT_X, PORT_TOP_Y, 10]),
        allowPort: 'bolt-carrier',
      },
      {
        id: 'bolt-travel',
        kind: 'bolt-travel',
        box: boxFromMinMax(
          [CARRIER_REST_X - BOLT_TRAVEL, CARRIER_Y - 0.25, -0.25],
          [CARRIER_REST_X, CARRIER_Y + 0.25, 0.25],
        ),
        allowPort: 'bolt-carrier',
      },
      // The handle's travel: it slides back as far as the bolt does, and rests outside this volume.
      {
        id: 'charging-handle',
        kind: 'charging-handle',
        box: boxFromMinMax([HANDLE_X[0] - BOLT_TRAVEL, 0, -4], [HANDLE_X[0], 2, -HALF_WIDTH]),
      },
    ];
    return {
      family: 'receiver',
      solids,
      ports,
      keepOuts,
      axes: [{ kind: 'bore', origin: [rear, 0, 0], dir: X }],
    };
  },
};
