import { html, nothing } from 'lit-html';
import { countText } from '../core/numberText.ts';
import type { ScreenText } from '../core/schema.ts';
import { fillText } from '../core/textTemplate.ts';
import { comboBox } from './comboBox.ts';
import type { CraftRow } from './craftReadout.ts';
import { fillHint } from './keyCap.ts';

export const craftRequirements = (
  row: Pick<CraftRow, 'id' | 'name' | 'components' | 'qualities' | 'skills' | 'workstation'>,
  prefer: (id: string, group: number, item: string) => void,
  text: ScreenText['crafting'],
) => html`
  ${row.components.map(
    (group) => html`<div class="craft-components">
      ${group.alternatives.map((a) => html`<div class=${a.found < a.needed ? 'craft-gap' : ''}>${fillText(text.found, { item: a.name, found: countText(a.found), needed: countText(a.needed) })}</div>`)}
      ${
        group.alternatives.length > 1
          ? html`<div class="craft-use">${fillHint(text.use, {
              choice: comboBox({
                label: fillText(text.group, { recipe: row.name, group: countText(group.group + 1) }),
                options: [
                  { value: '', label: text.cheapestAvailable },
                  ...group.alternatives.map((a) => ({ value: a.id, label: a.name })),
                ],
                value: group.preferred,
                emptyLabel: text.noMatches,
                choose: (item) => prefer(row.id, group.group, item),
              }),
            })}</div>`
          : nothing
      }
    </div>`,
  )}
  ${row.qualities.map((q) => html`<div class=${q.best < q.required ? 'craft-gap' : ''}>${fillText(text.quality, { quality: q.name, best: countText(q.best), required: countText(q.required) })}</div>`)}
  ${row.skills.map((s) => html`<div class=${s.available < s.required ? 'craft-gap' : ''}>${fillText(text.skill, { skill: s.name, level: countText(s.available), required: countText(s.required) })}</div>`)}
  ${row.workstation ? html`<div>${fillText(text.station, { station: row.workstation })}</div>` : nothing}
`;
