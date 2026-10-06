import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { milestonesFromPrBody, tickMilestone } from '../tools/slice-checklist.mjs';

const missingMilestone = /Checklist milestone 3\.4 was not found/;

describe('slice milestone PR declarations', () => {
  it('reads multiple ids on a line and across lines', () => {
    assert.deepEqual(milestonesFromPrBody('Details\nSlice-Milestone: 3.4, 3.5\nSlice-Milestone: 3.6 3.4'), [
      '3.4',
      '3.5',
      '3.6',
    ]);
    assert.deepEqual(milestonesFromPrBody('No milestone declaration'), []);
  });
});

describe('slice checklist updates', () => {
  it('ticks an unchecked entry and keeps its description', () => {
    assert.equal(
      tickMilestone('- [ ] 3.4 body model\n- [ ] 3.5', '3.4', 294),
      '- [x] 3.4 — #294 body model\n- [ ] 3.5',
    );
  });

  it('appends a PR reference to an already-ticked entry', () => {
    assert.equal(tickMilestone('- [x] 3.4 — #271', '3.4', 294), '- [x] 3.4 — #271, #294');
  });

  it('reports a missing milestone entry', () => {
    assert.throws(() => tickMilestone('- [ ] 3.5', '3.4', 294), missingMilestone);
  });

  it('matches 3.1 without ticking 3.10 or 3.11', () => {
    assert.equal(
      tickMilestone('- [ ] 3.1\n- [ ] 3.10\n- [ ] 3.11', '3.1', 294),
      '- [x] 3.1 — #294\n- [ ] 3.10\n- [ ] 3.11',
    );
  });
});
