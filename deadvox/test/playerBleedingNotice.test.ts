import { expect, it } from 'vitest';
import { PlayerBleedingNotice } from '../src/game/playerBleedingNotice.ts';

it('notifies once when bleeding starts, including a later re-bleed after treatment', () => {
  const notice = new PlayerBleedingNotice(false);
  let notifications = 0;
  const notify = () => {
    notifications += 1;
  };

  notice.update(true, notify);
  notice.update(true, notify);
  expect(notifications).toBe(1);

  notice.update(false, notify);
  notice.update(true, notify);
  expect(notifications).toBe(2);
});

it('does not report an already-bleeding loaded body as a new wound', () => {
  const notice = new PlayerBleedingNotice(true);
  let notifications = 0;

  notice.update(true, () => {
    notifications += 1;
  });
  expect(notifications).toBe(0);
});
