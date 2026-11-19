import type { ReplayActionPayload } from '@skelly/engine/input';
import type { ConditionBand } from '@skelly/engine/inventory';
import type { BlockEntity } from '@skelly/engine/world';
import type { Triple } from '../render/slotSockets.ts';
import type { CraftRow } from './craftReadout.ts';

/** Where a work site stands in its model's own frame, and the box a pick of it covers there, centred on it. */
export interface SiteAnchor {
  readonly position: Triple;
  readonly orientationDegrees?: Triple;
  readonly pickSize: Triple;
  /** Whether the model's own look draws the site's socket; otherwise its view marks the site by default. */
  readonly socketArt: boolean;
}

export interface SiteService {
  readonly row: CraftRow;
  /** The command Start sends, as the producer resolved it; a fit with no spare in reach has a refusal and none. */
  readonly start: ReplayActionPayload | undefined;
}

/** Why a site keeps its model from working. */
export interface SiteFault {
  readonly label: string;
  readonly detail: string | undefined;
}

/**
 * One site of a worked model as the Work on screen lists, picks and services it. A producer per kind of model fills it,
 * so the screen reads no kind's content and a model built in play serves as well as an authored one.
 */
export interface WorkSite {
  readonly id: string;
  readonly name: string;
  /** Where the site stands on the model; none lists it without a pick there. */
  readonly anchor?: SiteAnchor;
  /** The fitted part; none means an empty site. */
  readonly part?: { readonly name: string; readonly condition: ConditionBand };
  readonly fault?: SiteFault;
  /** A filled site's one remove, or an empty site's fit per spare in reach. */
  readonly services: readonly SiteService[];
}

/** One kind of model's work sites, which the screen asks for without knowing the kind. */
export interface WorkSiteProducer {
  /** Whether taking the target apart reviews it by its sites. */
  readonly serves: (target: BlockEntity) => boolean;
  readonly sites: (target: BlockEntity) => WorkSite[];
  /** What the target's sites show beyond the screen's own choices, so a change to it redraws the review. */
  readonly drawState: (target: BlockEntity) => unknown;
}
