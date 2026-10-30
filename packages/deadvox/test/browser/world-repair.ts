import '../../src/ui/style.css';
import { CORE_CONTENT_IDS } from '../../src/core/contentIds.ts';
import { buildBundledContent } from '../../src/game/bundledContent.ts';
import { applyUiTokens } from '../../src/ui/uiTokens.ts';
import { worldRepairSources } from '../worldRepairFixture.ts';
import { mountWorldRepairFixture } from '../worldRepairSurfaceFixture.ts';

const root = document.querySelector<HTMLElement>('#world-repair')!;
const content = buildBundledContent(worldRepairSources());
if (content.issues.length > 0) {
  throw new Error(JSON.stringify(content.issues));
}
const fixture = mountWorldRepairFixture(root, content.registry);
applyUiTokens(fixture.registry, document.documentElement);
fixture.keyboard.install();
document.querySelector<HTMLElement>('[data-enter-world]')!.addEventListener('click', fixture.open);
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement && fixture.surface.context === 'world-targeting') {
    const sensitivity = fixture.registry.player.get(CORE_CONTENT_IDS.player)!.aim.lookSensitivityRadiansPerPixel;
    fixture.turn(-event.movementX * sensitivity, -event.movementY * sensitivity);
    fixture.surface.update(0);
  }
});
Object.assign(globalThis, { worldRepairTest: fixture });
