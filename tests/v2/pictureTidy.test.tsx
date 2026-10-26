// The runway picture draws no "N up" note, and gives an ARR or DEP label only to the runway ends the
// recommended mode uses; the unused ends keep their line and still carry their painted runway number,
// in muted grey (owner, 26-10-2026 and issue 141), but no ARR/DEP label.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Picture } from '../../src/v2/components/Picture';
import { pictureModel } from '../../src/v2/model/picture';
import { inputFor, steady } from '../engine/helpers';
import { BASE, packOf, rigFor } from '../engine/planHelpers';
import { PACKS } from '../helpers/packs';
import { viewFromInput } from './helpers';

describe.each(PACKS.map((p) => [p.name, p] as const))('the picture is tidy [%s]', (_n, ref) => {
  const pack = packOf(rigFor(ref));
  const model = pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: steady(10, 12) }])));
  const html = renderToStaticMarkup(<Picture model={model} />);
  const ends = model.diagram.runways.flatMap((r) => r.ends);

  it('draws no "N up" note', () => {
    expect(html).not.toContain('N up');
  });

  it('gives an ARR/DEP label only to the ends that have a role, and still draws every runway', () => {
    // the painted runway number (class "rwy-number") carries every end's name regardless of role
    // (issue 141); strip those out first so this checks only the ARR/DEP label.
    const withoutTitleOrNumbers = html.replace(/<title[\s\S]*?<\/title>/, '').replace(/<text class="rwy-number"[^>]*>[\s\S]*?<\/text>/g, '');
    const labelled = (name: string): boolean => new RegExp(`<text[^>]*>\\s*${name}(<|\\s)`).test(withoutTitleOrNumbers);
    for (const e of ends) expect(labelled(e.name), `${e.name} roles ${e.roles.join('/')}`).toBe(e.roles.length > 0);
    // one group carrying data-used per runway (the asphalt strip and its markings), not a bare line (issue 141)
    expect(html.match(/<g [^>]*data-used/g)?.length).toBe(model.diagram.runways.length);
  });

  it('still paints every end its runway number, used or not (issue 141)', () => {
    expect(html).toContain('class="rwy-number"');
    for (const e of ends) expect(html).toContain(`>${e.name}</text>`);
  });
});
