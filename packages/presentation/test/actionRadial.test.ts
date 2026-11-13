import { describe, expect, it } from 'vitest';
import { radialLabelRadius } from '../src/ui/actionRadial.ts';

describe('radial label layout', () => {
  it('keeps every pair of label boxes apart for sparse and full rings, including enlarged labels', () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const scale of [1, 1.4]) {
        const boxes = Array.from({ length: count }, (_, index) => ({
          angleRadians: (index * Math.PI * 2) / count,
          width: (index % 2 === 0 ? 240 : 120) * scale,
          height: (index % 3 === 0 ? 64 : 32) * scale,
        }));
        const radius = radialLabelRadius(boxes, 110, 2);
        expect(radius).toBeGreaterThanOrEqual(110);
        for (const [index, box] of boxes.entries()) {
          for (const other of boxes.slice(0, index)) {
            const dx = Math.abs(Math.sin(box.angleRadians) - Math.sin(other.angleRadians)) * radius;
            const dy = Math.abs(Math.cos(box.angleRadians) - Math.cos(other.angleRadians)) * radius;
            expect(dx >= (box.width + other.width) / 2 || dy >= (box.height + other.height) / 2).toBe(true);
          }
        }
      }
    }
  });
});
