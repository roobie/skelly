import { expect, it, vi } from 'vitest';
import { startPlayFrames } from '../src/render/playFrames.ts';

it('passes RAF timestamps unchanged and stops when the gameplay frame returns false', () => {
  const callbacks: FrameRequestCallback[] = [];
  const request = vi.fn((callback: FrameRequestCallback) => callbacks.push(callback));
  const frame = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
  startPlayFrames(frame, request);
  expect(request).toHaveBeenCalledTimes(1);
  callbacks.shift()!(1234);
  expect(frame).toHaveBeenNthCalledWith(1, 1234);
  expect(request).toHaveBeenCalledTimes(2);
  callbacks.shift()!(1250);
  expect(frame).toHaveBeenNthCalledWith(2, 1250);
  expect(request).toHaveBeenCalledTimes(2);
  expect(callbacks).toHaveLength(0);
});
