import type { ThirdPersonOrbit } from './thirdPersonOrbit.ts';

// Keep single-tap debug-panel feedback short while reserving a second tap for camera gestures.
export const BACKQUOTE_DOUBLE_TAP_WINDOW_MS = 250;

export class BackquoteOrbitGesture {
  private readonly holdRealMs: number;
  private readonly orbit: ThirdPersonOrbit;
  private readonly canToggleHud: () => boolean;
  private readonly toggleHud: () => void;
  private readonly toggleDebugPanel: () => void;
  private downAt: number | undefined;
  private downKind: 'hud' | 'orbit' | undefined;
  private hudToggled = false;
  private panelOnTap = false;
  private tapAt: number | undefined;
  private panelPending = false;

  constructor(options: {
    readonly holdRealMs: number;
    readonly orbit: ThirdPersonOrbit;
    readonly canToggleHud: () => boolean;
    readonly toggleHud: () => void;
    readonly toggleDebugPanel: () => void;
  }) {
    this.holdRealMs = options.holdRealMs;
    this.orbit = options.orbit;
    this.canToggleHud = options.canToggleHud;
    this.toggleHud = options.toggleHud;
    this.toggleDebugPanel = options.toggleDebugPanel;
  }

  toggleHudIfAllowed(): void {
    if (this.canToggleHud()) {
      this.toggleHud();
    }
  }

  routeDebugAction(options: {
    readonly action: string;
    readonly at: number;
    readonly thirdPerson: boolean;
    readonly facingYaw: number;
    readonly handleAction: () => void;
  }): void {
    if (options.action === 'debug.panel-toggle' && options.thirdPerson) {
      this.keyDown(options.at, true, true, options.facingYaw);
      return;
    }
    options.handleAction();
  }

  routeInput(
    action: string,
    options: {
      readonly phase: 'down' | 'up';
      readonly at: number;
      readonly thirdPerson: boolean;
      readonly debugPanelAvailable: boolean;
      readonly facingYaw: number;
      readonly fallback: () => void;
    },
  ): boolean {
    if (action === 'debug.panel-toggle') {
      return options.phase === 'up' && this.keyUp(options.at);
    }
    if (action !== 'hud.toggle-interaction-hints') {
      return false;
    }
    const handled =
      options.phase === 'up'
        ? this.keyUp(options.at)
        : this.keyDown(options.at, options.thirdPerson, options.debugPanelAvailable, options.facingYaw);
    if (!handled) {
      options.fallback();
    }
    return true;
  }

  keyDown(at: number, thirdPerson: boolean, debugPanelAvailable: boolean, facingYaw: number): boolean {
    if (!thirdPerson) {
      return false;
    }
    this.update(at);
    if (this.downKind) {
      return true;
    }
    if (this.tapAt !== undefined && at - this.tapAt <= BACKQUOTE_DOUBLE_TAP_WINDOW_MS) {
      this.tapAt = undefined;
      this.panelPending = false;
      this.downAt = at;
      this.downKind = 'orbit';
      this.orbit.begin(facingYaw);
      return true;
    }
    this.downAt = at;
    this.downKind = 'hud';
    this.hudToggled = false;
    this.panelOnTap = debugPanelAvailable;
    return true;
  }

  keyUp(at: number): boolean {
    if (!this.downKind || this.downAt === undefined) {
      return false;
    }
    this.update(at);
    const duration = at - this.downAt;
    if (this.downKind === 'orbit') {
      if (duration <= BACKQUOTE_DOUBLE_TAP_WINDOW_MS) {
        this.orbit.reset();
      } else {
        this.orbit.release();
      }
    } else if (!this.hudToggled && duration < this.holdRealMs) {
      this.tapAt = at;
      this.panelPending = this.panelOnTap;
    }
    this.downAt = undefined;
    this.downKind = undefined;
    this.hudToggled = false;
    this.panelOnTap = false;
    return true;
  }

  update(at: number): void {
    if (
      this.downKind === 'hud' &&
      this.downAt !== undefined &&
      !this.hudToggled &&
      at - this.downAt >= this.holdRealMs
    ) {
      this.hudToggled = true;
      this.toggleHudIfAllowed();
    }
    if (this.tapAt !== undefined && at - this.tapAt > BACKQUOTE_DOUBLE_TAP_WINDOW_MS) {
      if (this.panelPending) {
        this.toggleDebugPanel();
      }
      this.tapAt = undefined;
      this.panelPending = false;
    }
  }

  cancel(): void {
    if (this.downKind === 'orbit') {
      this.orbit.release();
    }
    this.downAt = undefined;
    this.downKind = undefined;
    this.hudToggled = false;
    this.panelOnTap = false;
    this.tapAt = undefined;
    this.panelPending = false;
  }
}
