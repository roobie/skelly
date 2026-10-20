// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { type Binding, BindingRegistry, forwardedActionHolds, KeyboardInput } from '../src/game/inputBindings.ts';

it('route movement forwards native modifier flags and retains a shared sprint key while reversing direction', () => {
  const fixture: Binding[] = [
    {
      id: 'fixture.run',
      description: 'run',
      contexts: ['play'],
      commands: [{ id: 'fixture.run', kind: 'held-state' }],
      defaults: [{ code: 'ShiftLeft' }],
    },
    {
      id: 'fixture.forward',
      description: 'forward',
      contexts: ['play'],
      commands: [{ id: 'fixture.forward', kind: 'held-state' }],
      defaults: [{ code: 'KeyX', modifier: 'shift' }],
    },
    {
      id: 'fixture.back',
      description: 'back',
      contexts: ['play'],
      commands: [{ id: 'fixture.back', kind: 'held-state' }],
      defaults: [{ code: 'KeyY', modifier: 'shift' }],
    },
  ];
  const input = new KeyboardInput(new BindingRegistry(fixture));
  input.context = () => ({ context: 'play', debug: false });
  const hold = forwardedActionHolds(input);
  const sprint = hold('fixture.run');
  const forward = hold('fixture.forward');
  expect(input.held('fixture.run')).toBe(true);
  expect(input.held('fixture.forward')).toBe(true);
  forward();
  expect(input.held('fixture.forward')).toBe(false);
  expect(input.held('fixture.run')).toBe(true);
  const back = hold('fixture.back');
  expect(input.held('fixture.back')).toBe(true);
  back();
  sprint();
  expect(input.held('fixture.run')).toBe(false);
  expect(input.held('fixture.back')).toBe(false);
});
