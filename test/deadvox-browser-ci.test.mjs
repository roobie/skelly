import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { reserveDistinctPorts } from '../deadvox/tools/browser-ports.mjs';
import {
  browserManifest,
  browserStagesOfScripts,
  describeStage,
  parseCommand,
  quarantinedScripts,
  quarantinedStages,
  repositoryManifest,
  stagesOf,
} from './browser-ci-manifest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { scripts } = JSON.parse(readFileSync(join(ROOT, 'deadvox/package.json'), 'utf8'));
const browserStages = browserStagesOfScripts(scripts);
const covered = new Set(repositoryManifest(ROOT).full);
const uncovered = (name) =>
  browserStages[name]
    .map(describeStage)
    .filter((stage) => !(covered.has(stage) || Object.hasOwn(quarantinedStages, stage)));

const missingCase = /enabled package-script cases/;
const duplicateCase = /exactly once/;
const serialControl = /start independently/;
const expression = (body) => `\${{ ${body} }}`;

const partitionFixture = () => ({
  caller: {
    jobs: {
      browser: {
        if: expression("github.event.inputs.layout != 'control'"),
        uses: './.github/workflows/deadvox-browser.yml',
        strategy: { 'fail-fast': false, matrix: { shard: ['alpha', 'beta'] } },
        with: { shard: expression('matrix.shard') },
      },
      'control-check': {
        if: expression("github.event_name == 'workflow_dispatch' && github.event.inputs.layout == 'control'"),
        uses: './.github/workflows/deadvox-browser.yml',
        with: { shard: 'control-check' },
      },
      'control-stages': {
        if: expression("github.event_name == 'workflow_dispatch' && github.event.inputs.layout == 'control'"),
        uses: './.github/workflows/deadvox-browser.yml',
        with: { shard: 'control-stages' },
      },
    },
  },
  reusable: {
    jobs: {
      run: {
        steps: [
          {
            if: expression("inputs.shard == 'control-check' || inputs.shard == 'alpha'"),
            run: 'node test/browser/a.mjs',
          },
          {
            if: expression("inputs.shard == 'control-stages' || inputs.shard == 'beta'"),
            run: 'node test/browser/b.mjs',
          },
        ],
      },
    },
  },
  scripts: { 'test:browser': 'node test/browser/a.mjs && node test/browser/b.mjs' },
});
const manifestOf = (fixture) =>
  browserManifest({ ...fixture, caller: stringify(fixture.caller), reusable: stringify(fixture.reusable) });

describe('browser port reservation', () => {
  it('keeps the Vite port reserved while selecting a distinct Chrome port', async () => {
    const held = new Set();
    const reserve = () => {
      const port = held.has(36_483) ? 36_484 : 36_483;
      assert.equal(held.has(port), false);
      held.add(port);
      return { port, close: () => held.delete(port) };
    };
    const ports = await reserveDistinctPorts({ reserve });
    assert.deepEqual([ports.port, ports.cdpPort], [36_483, 36_484]);
    assert.deepEqual([...held].sort(), [36_483, 36_484]);
    await ports.release();
    assert.deepEqual([...held], []);
  });
});

describe('deadvox browser CI coverage', () => {
  it('normalizes a leading ./ and stage wrappers', () => {
    assert.deepEqual(parseCommand('SAVE_AUTOSAVE_ONLY=1 xvfb-run -a timeout 300 node ./test/browser/x.mjs'), {
      env: { SAVE_AUTOSAVE_ONLY: '1' },
      command: 'node test/browser/x.mjs',
    });
  });

  it('selects stages from actual browser command content', () => {
    assert.ok(Object.keys(browserStages).length > 0);
  });

  it('runs every enabled package-script case in the full reusable workflow', () => {
    const missing = Object.keys(browserStages)
      .filter((name) => !(name in quarantinedScripts))
      .flatMap((name) => uncovered(name));
    assert.deepEqual(missing, []);
  });

  it('rejects a missing case or a case executed in duplicate shards', () => {
    const fixture = partitionFixture();
    const plan = manifestOf(fixture);
    assert.deepEqual(Object.values(plan.partition).flat().sort(), plan.full.slice().sort());
    fixture.reusable.jobs.run.steps.pop();
    assert.throws(() => manifestOf(fixture), missingCase);
    const duplicate = partitionFixture();
    duplicate.caller.jobs.browser.strategy.matrix.shard.push('alpha');
    assert.throws(() => manifestOf(duplicate), duplicateCase);
  });

  it('rejects a dependency that serializes main control jobs', () => {
    const fixture = partitionFixture();
    fixture.caller.jobs['control-stages'].needs = 'control-check';
    assert.throws(() => manifestOf(fixture), serialControl);
  });

  it('quarantines only scripts that exist and have no executed cases', () => {
    for (const [name, reason] of Object.entries(quarantinedScripts)) {
      assert.ok(name in scripts, `${name} is gone: drop the quarantine (${reason})`);
      assert.equal(
        uncovered(name).length,
        stagesOf(scripts[name]).length,
        `${name} was reinstated without resolving its quarantine`,
      );
    }
  });

  it('keeps quarantined Chromium save-storage stages declared but out of CI', () => {
    const declared = new Set(Object.values(browserStages).flatMap((stages) => stages.map(describeStage)));
    for (const [stage, reason] of Object.entries(quarantinedStages)) {
      assert.ok(declared.has(stage), `${stage} is gone: drop the quarantine (${reason})`);
      assert.equal(covered.has(stage), false, `${stage} was reinstated without resolving its quarantine`);
    }
  });
});
