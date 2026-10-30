import { html, nothing, render } from 'lit-html';
import type { Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { CraftCommands, EntityRepairProjection } from '../core/craftCommands.ts';
import type { CraftPreference } from '../core/crafting.ts';
import { fillText } from '../core/textTemplate.ts';
import type { InputCancellationReason, InputCommand, InputContext, KeyboardInput } from '../game/inputBindings.ts';
import type { ReplayActionPayload } from '../game/replayCommands.ts';
import { craftingText } from './craftReadout.ts';
import { craftRequirementRows } from './craftRequirementRows.ts';
import { craftRequirements } from './craftRequirements.ts';
import { fillHint, type HintText } from './keyCap.ts';

type RepairIntent = Extract<ReplayActionPayload, { kind: 'craft.repair-entity' }>;
type SurfaceState = 'closed' | 'targeting' | 'actions' | 'details';
type SurfaceAction = 'inspect' | 'details' | 'confirm' | 'back';

interface WorldRepairOwner {
  registry: Registry;
  keyboard: KeyboardInput;
  crafting: Pick<CraftCommands, 'previewEntityRepair'>;
  /** The ordinary visible/reachable interaction ray, shared with mouse look. */
  aimedEntity: () => number | undefined;
  turn: (yaw: number, pitch: number) => void;
  emit: (intent: RepairIntent) => void;
  returned: () => void;
  aimRadiansPerRealSecond: number;
}

/** Opened meta controls: shape alone cannot communicate requirements or consent to work. */
export class WorldRepairSurface {
  readonly kind = 'meta';
  private state: SurfaceState = 'closed';
  private recipeId = '';
  private targetUid: number | undefined;
  private preference: Record<number, string> = {};
  private readonly root: HTMLElement;
  private readonly owner: WorldRepairOwner;
  constructor(root: HTMLElement, owner: WorldRepairOwner) {
    this.root = root;
    this.owner = owner;
    root.classList.add('world-service');
    root.hidden = true;
  }
  get context(): InputContext | undefined {
    if (this.state === 'closed') {
      return undefined;
    }
    return this.state === 'targeting' ? 'world-targeting' : 'world-service';
  }
  open(recipeId: string, preference: CraftPreference = {}): void {
    const recipe = this.owner.registry.recipes.get(recipeId);
    if (recipe?.kind !== 'repair' || !recipe.repair?.entity) {
      throw new Error('World repair requires an entity repair recipe');
    }
    this.recipeId = recipeId;
    this.preference = { ...preference };
    this.targetUid = undefined;
    this.transfer('targeting');
  }
  private transfer(state: SurfaceState): void {
    this.owner.keyboard.cancel();
    this.state = state;
    this.owner.keyboard.sync();
    this.update(0);
    this.root.querySelector<HTMLElement>('[data-world-action]')?.focus();
  }
  cancelInput(reason: InputCancellationReason): void {
    if (
      reason === 'window-blur' ||
      reason === 'document-hidden' ||
      reason === 'pointer-lock-lost' ||
      reason === 'modifier-state-lost'
    ) {
      this.close();
    }
  }
  close(): void {
    if (this.state === 'closed') {
      return;
    }
    this.state = 'closed';
    this.targetUid = undefined;
    this.root.hidden = true;
    this.owner.keyboard.sync();
    this.owner.returned();
  }
  back(): void {
    if (this.state === 'details') {
      this.transfer('actions');
    } else if (this.state === 'actions') {
      this.targetUid = undefined;
      this.transfer('targeting');
    } else {
      this.close();
    }
  }
  onCommand(command: InputCommand): void {
    if (command.phase !== 'down' || this.state === 'closed') {
      return;
    }
    switch (command.action) {
      case 'world.back':
        this.back();
        break;
      case 'world.actions':
        this.activate('inspect');
        break;
      case 'world.service-activate':
        this.activateFocused();
        break;
      case 'world.service-previous':
        this.focusStep(-1);
        break;
      case 'world.service-next':
        this.focusStep(1);
        break;
      default:
        break;
    }
  }
  private activateFocused(): void {
    const button = this.root.ownerDocument.activeElement;
    if (!(button instanceof HTMLElement && this.root.contains(button))) {
      return;
    }
    const action = button.dataset.worldAction;
    if (action === 'details' || action === 'confirm' || action === 'back') {
      // Keyboard consent must not be redirected to the drawn pointer's position.
      this.activate(action);
    }
  }
  private focusStep(step: number): void {
    const buttons = [...this.root.querySelectorAll<HTMLElement>('[data-world-action]')];
    const current = buttons.indexOf(this.root.ownerDocument.activeElement as HTMLElement);
    const next = buttons[(current + step + buttons.length) % buttons.length];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest' });
  }
  private projection(): EntityRepairProjection | undefined {
    const uid = this.state === 'targeting' ? this.owner.aimedEntity() : this.targetUid;
    return uid === undefined ? undefined : this.owner.crafting.previewEntityRepair(this.recipeId, uid, this.preference);
  }
  private activate(action: SurfaceAction): void {
    if (action === 'back') {
      this.back();
    } else if (action === 'inspect' && this.state === 'targeting') {
      const uid = this.owner.aimedEntity();
      if (uid !== undefined) {
        this.targetUid = uid;
        this.transfer('actions');
      }
    } else if (action === 'details' && this.state === 'actions') {
      this.transfer('details');
    } else if (action === 'confirm' && this.state === 'details') {
      // Requery the pinned UID, never the current crosshair or a displayed plan.
      const projection = this.projection();
      if (projection && !projection.refusal) {
        const intent: RepairIntent = {
          kind: 'craft.repair-entity',
          recipeId: this.recipeId,
          entityUid: projection.targetUid,
          preference: { ...this.preference },
        };
        this.close();
        this.owner.emit(intent);
      } else {
        this.update(0);
      }
    }
  }
  private advanceAim(realSeconds: number): void {
    if (this.state !== 'targeting') {
      return;
    }
    const held = (id: string) => Number(this.owner.keyboard.held(id));
    const delta = realSeconds * this.owner.aimRadiansPerRealSecond;
    this.owner.turn(
      (held('world.aim-left') - held('world.aim-right')) * delta,
      (held('world.aim-up') - held('world.aim-down')) * delta,
    );
  }
  private requirements(projection: EntityRepairProjection | undefined) {
    if (this.state !== 'details' || !projection?.requirements) {
      return nothing;
    }
    const recipe = this.owner.registry.recipes.get(this.recipeId)!;
    return craftRequirements(
      {
        id: recipe.id,
        name: this.owner.registry.furniture.get(recipe.repair!.entity!)!.name,
        ...craftRequirementRows(this.owner.registry, projection.requirements, this.preference),
        workstation: recipe.workstation ?? null,
      },
      (_id, group, item) => {
        if (item) {
          this.preference[group] = item;
        } else {
          Reflect.deleteProperty(this.preference, group);
        }
        this.update(0);
      },
      craftingText(this.owner.registry),
    );
  }
  update(realSeconds: number): void {
    if (this.state === 'closed') {
      return;
    }
    this.advanceAim(realSeconds);
    const projection = this.projection();
    const text = this.owner.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.worldService;
    let action: SurfaceAction = 'details';
    let label: HintText = text.details;
    if (this.state === 'targeting') {
      action = 'inspect';
      label = fillHint(text.actions, {
        key: html`<kbd class="keycap">${this.owner.keyboard.registry.label('world.actions')}</kbd>`,
      });
    } else if (this.state === 'details') {
      action = 'confirm';
      label = text.start;
    }
    const recipe = this.owner.registry.recipes.get(this.recipeId)!;
    const jobName = fillText(craftingText(this.owner.registry).repairName, {
      item: this.owner.registry.furniture.get(recipe.repair!.entity!)!.name,
    });
    const refused = this.state === 'targeting' ? !projection : this.state === 'details' && Boolean(projection?.refusal);
    const target = projection?.targetName
      ? fillText(text.target, { name: projection.targetName, damage: projection.damage! })
      : craftingText(this.owner.registry).noRepairTarget;
    this.root.hidden = false;
    render(
      html`
      <header><h2>${text.heading}</h2></header>
      <h3>${target}</h3>
      <h4>${jobName}</h4>
      ${this.requirements(projection)}
      <button type="button" data-world-action=${action} aria-disabled=${refused ? 'true' : 'false'}
        aria-describedby=${projection?.refusal ? 'world-repair-reason' : nothing}
        @click=${() => this.activate(action)}>${label}</button>
      <button type="button" data-world-action="back" @click=${() => this.activate('back')}>${text.back}</button>
      ${projection?.refusal ? html`<p id="world-repair-reason" class="craft-gap">${projection.refusal}</p>` : nothing}
    `,
      this.root,
    );
  }
}
