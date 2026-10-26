// The runway picture draws no "N up" note, and names only the runway ends the recommended mode uses
// (arrivals or departures); the unused ends keep their line but carry no label (owner, 26-10-2026).
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

  it('labels only the ends that have a role, and still draws every runway line', () => {
    const labelled = (name: string): boolean => new RegExp(`<text[^>]*>\\s*${name}(<|\\s)`).test(html.replace(/<title[\s\S]*?<\/title>/, ''));
    for (const e of ends) expect(labelled(e.name), `${e.name} roles ${e.roles.join('/')}`).toBe(e.roles.length > 0);
    expect(html.match(/<line [^>]*data-used/g)?.length).toBe(model.diagram.runways.length);
  });
});
