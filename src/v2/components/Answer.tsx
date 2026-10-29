// The answer band: the state (a glyph and a word), the mode, the next change and
// the arrival and departure runways. Text nodes only (SEC-2). There is no current-mode selector (issue 104).
import { useEffect, useState } from 'react';
import type { AnswerModel } from '../model/answer';
import type { AtisChip } from '../model/atis';
import { copyText } from '../copy';
import { StateGlyph } from './Icons';
import { Tip } from './Popover';

/** The words that show after a click for a moment. */
export const COPIED_WORD = 'Copied';
export const COPIED_MS = 1500;

/** The click handler: copy the text, and call onCopied only when it worked. */
export function copyHandler(text: string, onCopied: () => void): () => void {
  return () => {
    void copyText(text).then((ok) => {
      if (ok) onCopied();
    });
  };
}

/** A real button that copies the mode's ATIS runway text (issue 150). Looks like the text it wraps; "Copied" shows for about 1.5 seconds. */
export function CopyButton({ text, modeId, className, testId, children }: { text: string; modeId: string; className?: string; testId?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  // "Copied" goes after COPIED_MS; a fresh click restarts the wait because the effect runs again.
  const [clicks, setClicks] = useState(0);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied, clicks]);
  const onClick = copyHandler(text, () => {
    setCopied(true);
    setClicks((n) => n + 1);
  });
  return (
    <button type="button" className={`copy ${className ?? ''}`.trim()} aria-label={`Copy ATIS text for ${modeId}`} data-copy={text} data-testid={testId} onClick={onClick}>
      {children}
      {copied ? (
        <span className="copied" role="status">
          {COPIED_WORD}
        </span>
      ) : null}
    </button>
  );
}

/** The ranking as coloured rows: blue for the recommended mode, green for suitable, grey for unsuitable. */
function PriorityRich({ model }: { model: AnswerModel }) {
  return (
    <>
      <b className="pr-title">Runway mode priority</b>
      <span className="pr-sub">1 is the most preferred.</span>
      <span className="pr-grid">
        {model.priorityRows.map((r) => (
          <span key={r.modeId} className={`pr-row pr-${r.state}`}>
            <span className="pr-n">{r.rank}</span>
            <span>{r.modeId}</span>
            <span className="pr-s">{r.state}</span>
          </span>
        ))}
      </span>
    </>
  );
}

function MainMode({ model }: { model: AnswerModel }) {
  const id = model.modeId ?? '';
  return model.copyText === null ? <>{id}</> : <CopyButton text={model.copyText} modeId={id} className="mode-btn">{id}</CopyButton>;
}

export function Answer({ model, atis = null }: { model: AnswerModel; atis?: AtisChip | null }) {
  const { band } = model;
  const rich = model.priorityText === null ? undefined : <PriorityRich model={model} />;
  // Under the "Also suitable" chips (inside their block, but outside their labelled group); on a phone it sits beside the label so the closed screen does not grow.
  const atisChip =
    atis === null ? null : (
      <div className="atis-chip" role="group" tabIndex={0} aria-label={atis.label} data-testid="atis-chip" data-matched={atis.matched ? 'true' : 'false'}>
        <i className="atis-dot" aria-hidden="true" />
        {atis.text}
      </div>
    );
  return (
    <div className="answer">
      <div className="state-row">
        <span className={`state state-${band.tone}`} role="status" data-testid="state-band" data-state={band.id}>
          <StateGlyph glyph={band.glyph} />
          {band.word}
        </span>
        {model.priorityText === null ? null : (
          <Tip text={model.priorityText} rich={rich} className="info" tabIndex={0} role="group" aria-label="Runway mode priority" data-testid="priority-info">
            i
          </Tip>
        )}
      </div>
      {model.modeId === null ? (
        <div className="mode none" aria-label={model.modeLabel}>
          &ndash;
        </div>
      ) : model.approach === null ? (
        <div className={`mode ${model.modeSize === 'normal' ? '' : model.modeSize}`.trim()} aria-label={model.modeLabel} data-testid="mode">
          <MainMode model={model} />
        </div>
      ) : (
        <div className="mode-row">
          <div className={`mode ${model.modeSize === 'normal' ? '' : model.modeSize}`.trim()} aria-label={model.modeLabel} data-testid="mode">
            <MainMode model={model} />
          </div>
          <Tip text={model.approach.hover} className="appr" tabIndex={0} role="group" aria-label={`Approach type ${model.approach.chip}`} data-testid="approach-chip">
            {model.approach.chip}
          </Tip>
        </div>
      )}
      {model.next === '' ? null : (
        <div className="next" data-testid="next">
          {model.next}
        </div>
      )}
      {model.why === null ? null : (
        <Tip tag="div" text={model.why} className="why1" data-testid="why">
          {model.why}
        </Tip>
      )}
      {model.arrivals === null || model.departures === null ? null : (
        <div className="rw">
          Arr <b>{model.arrivals}</b> &middot; Dep <b>{model.departures}</b>
        </div>
      )}
      {model.alternatives.length === 0 ? (
        atisChip
      ) : (
        <div className="alt">
          <div role="group" aria-label="Also suitable" data-testid="alternatives">
            {model.priorityText === null ? (
              <div className="alt-label">Also suitable</div>
            ) : (
              <Tip tag="div" text={model.priorityText} rich={rich} className="alt-label" data-testid="alt-label">
                Also suitable
              </Tip>
            )}
            <div className="alt-chips">
              {model.alternatives.map((a) => (
                <CopyButton key={a.modeId} text={a.copyText} modeId={a.modeId} className="alt-chip" testId="alt-chip">
                  <i className="alt-dot" aria-hidden="true" />
                  {a.modeId}
                </CopyButton>
              ))}
            </div>
          </div>
          {atisChip}
        </div>
      )}
      {model.conditional === null ? null : (
        <p className="banner banner-ok cond" role="status" data-testid="conditional-note">
          <b>&#10003; {model.conditional.title}</b> {model.conditional.text}
        </p>
      )}
    </div>
  );
}
