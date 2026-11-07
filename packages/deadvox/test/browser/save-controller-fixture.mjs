// biome-ignore-all lint/correctness/noNodejsModules: standalone browser regression contract
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node test contract

import assert from 'node:assert/strict';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { instrumentModelLoads, modelLoadAuditPlugin } from './model-load-audit.mjs';

const root = resolvePath(fileURLToPath(new URL('../..', import.meta.url)));
const { createServer } = await import('vite');
const observation = {
  name: 'save-controller-game-ready',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/mods/skelly.deadvox.scenario.tutorial/tutorial.json')) {
      // Independent content identities catch runtime dispatch by scenario-specific names.
      const content = JSON.parse(code);
      for (const layout of content.layouts) {
        const previous = layout.practice.exitMark;
        layout.practice.exitMark = 'fixture_guide_exit';
        layout.beats = layout.beats.map((mark) =>
          mark.id === previous ? { ...mark, id: layout.practice.exitMark } : mark,
        );
        const [first] = layout.guidance.steps;
        const oldStage = first.id;
        first.id = 'fixture_arrival';
        for (const row of [...layout.guidance.rules, ...layout.guidance.choices]) {
          row.at = row.at.map((stageId) => (stageId === oldStage ? first.id : stageId));
        }
      }
      return JSON.stringify(content);
    }
    if (id.endsWith('/src/render/models.ts')) {
      return instrumentModelLoads(code);
    }
    if (id.endsWith('/src/game/worldSetup.ts')) {
      // The scenario as it enters kind dispatch, so the fixture holds whichever site the kind builds.
      const marker = 'const scenario = registry.scenarios.get(config.site);';
      assert(code.includes(marker), 'scenario population fixture admission point exists');
      return code.replace(
        marker,
        "const scenario = ((found) => found && new URLSearchParams(location.search).get('route-fixture') === '1' ? { ...found, population: { ...found.population, settlementPressure: false, authoredMarkers: false } } : found)(registry.scenarios.get(config.site));",
      );
    }
    if (id.endsWith('/src/ui/saveController.ts')) {
      return code.replace(
        '    this.environmentProblem = saveEnvironmentProblem();',
        '    globalThis.saveControllerConstructed = true;\n    this.environmentProblem = saveEnvironmentProblem();',
      );
    }
    if (id.endsWith('/src/game/simulationStepper.ts')) {
      const stepperMarker = '    step,\n';
      assert(code.includes(stepperMarker), 'stepper roll observation point exists');
      return code.replace(
        stepperMarker,
        `${stepperMarker}    rollFullReplayWindow: () => { if (recording.recorder?.full) rollInputRecorderWindow(); },\n`,
      );
    }
    if (!id.endsWith('/src/presentation/play.ts')) {
      return;
    }
    const marker = '  startRealFrames(frame);';
    assert(code.includes(marker), 'game-ready observation point exists');
    return code.replace(
      marker,
      "  Object.assign(globalThis, { saveControllerPlayStarted: true, worldLoadWitness: { engine, session, worldLoading, frame }, tutorialSession: options.tutorial ? session : undefined, gauntletWitness: { engine, session, recording, measureSnapshot, input, eye, lookedAt: () => { const target = interactionTargetAt(); return target?.kind === 'furniture' ? target.entity : undefined; }, manual: false, rollReplay: () => stepper.rollFullReplayWindow() } });\n  startRealFrames((now) => globalThis.gauntletWitness.manual ? true : frame(now));",
    );
  },
};

/** The observed game server both save-controller stages drive, and the address each stage opens. */
export const saveControllerServer = async () => {
  const server = await createServer({
    root,
    configFile: `${root}/vite.config.ts`,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [modelLoadAuditPlugin, observation],
  });
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  return {
    server,
    address: `http://127.0.0.1:${address.port}/?seed=73&radius=32&site=testHouse&actors=boxes&post=0&sunshadow=0&torchshadow=0&save-test=1&save-backend=indexeddb`,
  };
};
