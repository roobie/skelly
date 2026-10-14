import { describe, expect, it, vi } from 'vitest';
import { Tutorial, type TutorialObservation, tutorialRequested, tutorialUrl } from '../src/game/tutorial.ts';

const observation = (): TutorialObservation => ({
  position: [0, 1, 0],
  yaw: 0,
  crouching: false,
  doorOpen: false,
  searched: false,
  looted: false,
  wielded: false,
  lightOn: false,
  paused: false,
});
const fixture = () => {
  const complete = vi.fn();
  const tutorial = new Tutorial([0, 1, 0], 0, { x0: 10, z0: 10, x1: 12, z1: 12 }, complete);
  const state = observation();
  const observe = () => tutorial.observe(state);
  return { tutorial, state, complete, observe };
};

describe('practice objectives', () => {
  it('advances only on completed outcomes and returns to start after the final pause', () => {
    const { tutorial, state, complete, observe } = fixture();
    observe();
    expect(tutorial.stage).toBe('move');
    state.position = [7, 1, 0];
    observe();
    expect(tutorial.stage).toBe('move');
    state.yaw = 1;
    observe();
    expect(tutorial.stage).toBe('door');
    state.doorOpen = true;
    observe();
    expect(tutorial.stage).toBe('loot');
    state.searched = true;
    observe();
    expect(tutorial.stage).toBe('loot');
    state.looted = true;
    observe();
    expect(tutorial.stage).toBe('hands');
    state.wielded = true;
    observe();
    expect(tutorial.stage).toBe('eat');
    tutorial.consumed('unrelated_fixture_food');
    expect(tutorial.stage).toBe('eat');
    tutorial.consumed('canned_beans');
    expect(tutorial.stage).toBe('drink');
    tutorial.consumed('water_bottle');
    expect(tutorial.stage).toBe('light');
    observe();
    expect(tutorial.stage).toBe('light');
    state.lightOn = true;
    observe();
    expect(tutorial.stage).toBe('light');
    state.lightOn = false;
    observe();
    expect(tutorial.stage).toBe('escape');
    state.position = [11, 1, 11];
    observe();
    expect(tutorial.stage).toBe('escape');
    state.crouching = true;
    observe();
    expect(tutorial.stage).toBe('pause');
    expect(complete).not.toHaveBeenCalled();
    state.paused = true;
    observe();
    observe();
    expect(complete).toHaveBeenCalledOnce();
    expect(new URL(tutorialUrl('https://example.org/deadvox/?tutorial=1', false)).search).toBe('');
  });

  it('remembers out-of-order supplies instead of requiring already consumed items again', () => {
    const { tutorial, state, observe } = fixture();
    tutorial.consumed('canned_beans');
    tutorial.consumed('water_bottle');
    state.wielded = true;
    state.lightOn = true;
    observe();
    state.lightOn = false;
    observe();
    state.position = [7, 1, 0];
    state.yaw = 1;
    state.doorOpen = true;
    state.searched = true;
    state.looted = true;
    observe();
    expect(tutorial.stage).toBe('escape');
  });

  it('also isolates direct authored-site links and clears continuation and debug parameters on exit', () => {
    expect(tutorialRequested(new URLSearchParams('site=tutorial'))).toBe(true);
    expect(tutorialRequested(new URLSearchParams('tutorial=1'))).toBe(true);
    expect(tutorialRequested(new URLSearchParams('site=hamlet'))).toBe(false);
    const start = new URL(
      tutorialUrl('https://example.org/deadvox/?tutorial=1&debug=1&save-backend=indexeddb#continue', false),
    );
    expect(start.pathname).toBe('/deadvox/');
    expect(start.searchParams.get('save-backend')).toBe('indexeddb');
    expect([...start.searchParams.keys()]).toEqual(['save-backend']);
    expect(start.hash).toBe('');
  });
});
