import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { milestonesFromPrBody, tickMilestone } from '../tools/slice-checklist.mjs';

const missingMilestone = /Checklist milestone 3\.4 was not found/;
const duplicateMilestone = /Multiple checklist entries/;
const TEMPLATE_FRONT_MATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

describe('slice checklist template', () => {
  it('supplies a discoverable label and tickable milestone rows', () => {
    const template = readFileSync(new URL('../.github/ISSUE_TEMPLATE/slice-checklist.md', import.meta.url), 'utf8');
    const match = template.match(TEMPLATE_FRONT_MATTER);
    assert.ok(match, 'template has delimited front matter');

    const metadata = parse(match[1]);
    const rawLabels = metadata.labels ?? [];
    const labels = Array.isArray(rawLabels)
      ? rawLabels
      : String(rawLabels)
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean);
    const populated = match[2]
      .replace('<milestone ID>', '4.1')
      .replace('<link>', '#900')
      .replace('<result>', 'fixture outcome');
    let ticked = '';
    try {
      ticked = tickMilestone(populated, '4.1', 900);
    } catch {
      // The contract assertion below reports a missing or malformed checklist row.
    }

    assert.deepEqual(
      { discoverable: labels.includes('slice-checklist'), milestoneTicks: ticked.includes('- [x] 4.1 — #900') },
      { discoverable: true, milestoneTicks: true },
    );
  });
});

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

  it('rejects duplicate checklist entries for one milestone', () => {
    assert.throws(() => tickMilestone('- [ ] 3.4\n- [x] 3.4', '3.4', 294), duplicateMilestone);
  });

  it('matches 3.1 without ticking 3.10 or 3.11', () => {
    assert.equal(
      tickMilestone('- [ ] 3.1\n- [ ] 3.10\n- [ ] 3.11', '3.1', 294),
      '- [x] 3.1 — #294\n- [ ] 3.10\n- [ ] 3.11',
    );
  });
});
