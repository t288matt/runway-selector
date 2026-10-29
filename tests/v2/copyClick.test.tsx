// Clicking a mode copies its ATIS text (issue 150). No DOM library is installed, so the rendered markup is read and the click handler is called directly.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Answer, copyHandler } from '../../src/v2/components/Answer';
import { copyText } from '../../src/v2/copy';
import { answerModel } from '../../src/v2/model/answer';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { YSSY_PACK } from '../helpers/packs';
import { viewOf } from './helpers';

/** The text each copy button carries, main mode first, read from the rendered markup. */
function copyTexts(model: ReturnType<typeof answerModel>): string[] {
  const html = renderToStaticMarkup(<Answer model={model} />);
  return [...html.matchAll(/data-copy="([^"]*)"/g)].map((m) => (m[1] ?? '').replace(/&amp;/g, '&'));
}

afterEach(() => vi.unstubAllGlobals());

describe('click to copy', () => {
  const rig = rigFor(YSSY_PACK);
  const model = answerModel(viewOf(packOf(rig), rig, same<Wx>(4, 'ok'), same(4, 'light')));

  it('the main mode and each chip are buttons that carry their own text', () => {
    expect(model.alternatives.length).toBeGreaterThan(0);
    const texts = copyTexts(model);
    expect(texts[0]).toBe(model.copyText);
    expect(texts.slice(1)).toEqual(model.alternatives.map((a) => a.copyText));
    const html = renderToStaticMarkup(<Answer model={model} />);
    expect(html).toContain(`<button type="button" class="copy mode-btn" aria-label="Copy ATIS text for ${model.modeId}"`);
    expect(html.split('aria-label="Copy ATIS text for').length - 1).toBe(1 + model.alternatives.length);
    expect(html).toContain('data-testid="alt-chip"');
    expect(html).not.toContain('Copied');
  });

  it('copyText calls navigator.clipboard.writeText with the main text and with a chip text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText(model.copyText ?? '')).toBe(true);
    expect(writeText).toHaveBeenCalledWith(model.copyText);
    const chip = model.alternatives[0];
    await copyText(chip?.copyText ?? '');
    expect(writeText).toHaveBeenLastCalledWith(chip?.copyText);
  });

  it('a click on the main mode button and on a chip button writes that button text, then confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const texts = copyTexts(model);
    const onCopied = vi.fn();
    for (const t of [texts[0], texts[1]]) {
      copyHandler(t ?? '', onCopied)();
      await new Promise((r) => setTimeout(r, 0));
      expect(writeText).toHaveBeenLastCalledWith(t);
    }
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(onCopied).toHaveBeenCalledTimes(2);
  });

  it('does not confirm when the copy failed', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', undefined);
    const onCopied = vi.fn();
    copyHandler('x', onCopied)();
    await new Promise((r) => setTimeout(r, 0));
    expect(onCopied).not.toHaveBeenCalled();
  });

  it('falls back to execCommand when the clipboard API is missing', async () => {
    const area = { value: '', style: {} as Record<string, string>, setAttribute: vi.fn(), select: vi.fn() };
    const exec = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { createElement: () => area, body: { appendChild: vi.fn(), removeChild: vi.fn() }, execCommand: exec });
    expect(await copyText('07 FOR ARR. RWY 16L AND R FOR DEPS')).toBe(true);
    expect(area.value).toBe('07 FOR ARR. RWY 16L AND R FOR DEPS');
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('reports failure when the clipboard rejects and there is no document', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    vi.stubGlobal('document', undefined);
    expect(await copyText('x')).toBe(false);
  });
});
