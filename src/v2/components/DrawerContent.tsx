// What the More drawer holds: Why, Reports, Key and Settings. Text nodes only
// (SEC-2). The Reports section is v2's own copy of v1's weather entry (same
// behaviour and wording); the Settings section is v2's own copy of v1's settings
// drawer. There is no Data section: the per-slot arrival, departure and movement
// figures are not shown in v2 (owner, 26-10-2026); the traffic tile, its popover
// and the Traffic row of the Evaluation and TAF section carry the traffic.
import { useState } from 'react';
import type { AirportPack } from '../../refdata';
import type { AuditEntry, AuditExport } from '../../store';
import { WEATHER_CREDIT } from '../../weather/config';
import type { AutoReportState, ReloadState, WeatherKind } from '../controller';
import { downloadText } from '../download';
import type { ApplyOutcome } from '../model/apply';
import type { ViewData } from '../model/dashboard';
import { auditRows, keyModel, READ_ONLY_NOTE, settingsModel, SIMULATION_LABEL, whyModel } from '../model/drawer';
import { LEGEND_GLYPH } from '../model/evaluation';
import { StateGlyph } from './Icons';

export interface DrawerBridge {
  readonly view: ViewData;
  readonly displayNowMs: number;
  readonly auto: Readonly<Record<WeatherKind, AutoReportState>>;
  readonly reload: ReloadState;
  readonly audit: readonly AuditEntry[];
  readonly onApplyMetar: (text: string) => ApplyOutcome;
  readonly onApplyTaf: (text: string) => ApplyOutcome;
  readonly onResume: (kind: WeatherKind) => void;
  readonly onReload: () => void;
  readonly onClearAudit: () => void;
  readonly onExportAudit: () => AuditExport;
}

export const DRAWER_SECTIONS = [
  { id: 'drawer-why', title: 'Why' },
  { id: 'drawer-reports', title: 'Reports' },
  { id: 'drawer-key', title: 'Key' },
  { id: 'drawer-settings', title: 'Settings' },
] as const;

/** The refusal message and the decoder's warnings, as plain text. */
export function ApplyNote({ outcome }: { outcome: ApplyOutcome }) {
  return (
    <>
      {outcome.message === null ? null : (
        <div className="refused" role="alert">
          {outcome.message}
        </div>
      )}
      {outcome.warnings.length === 0 ? null : (
        <ul className="warnings">
          {outcome.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------- why
function Why({ view }: { view: ViewData }) {
  const m = whyModel(view);
  return (
    <>
      {m.kind === 'no-suitable' && m.noSuitable !== null ? (
        <ul>
          {m.noSuitable.perMode.map((p) => (
            <li key={p.modeId}>
              {p.text} {p.restoreText}
            </li>
          ))}
        </ul>
      ) : null}
      {m.kind === 'no-data' ? (
        <ul>
          {m.missing.map((t, i) => (
            <li key={`${i}-${t}`}>{t}</li>
          ))}
        </ul>
      ) : null}
      {m.banners.map((b) => (
        <p key={b.title} className={`banner banner-${b.tone}`}>
          <b>{b.title}</b> {b.text}
        </p>
      ))}
      {m.kind === 'recommended' && m.lines.length === 0 ? <p>{m.headline}</p> : null}
      {m.lines.map((l, i) => (
        <p key={`${i}-${l}`}>{l}</p>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ reports
function SourceNote({ id, label, auto, onResume }: { id: string; label: string; auto: AutoReportState; onResume: () => void }) {
  return (
    <>
      {auto.paused ? (
        <div className="age" data-testid={`${id}-source`}>
          Pasted by you; automatic {label} updates are paused.{' '}
          <button type="button" className="btn small" onClick={onResume}>
            Resume automatic
          </button>
        </div>
      ) : null}
      {auto.error === null ? null : (
        <div className="refused" role="alert" data-testid={`${id}-fetch-error`}>
          {auto.error} The previous {label}, if any, stays in use.
        </div>
      )}
      {auto.warnings.length === 0 ? null : (
        <ul className="warnings">
          {auto.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Box({ id, label, rows, note, inUse, auto, showPaste, onApply, onResume }: { id: string; label: string; rows: number; note: string; inUse: string | null; auto: AutoReportState; showPaste: boolean; onApply: (text: string) => ApplyOutcome; onResume: () => void }) {
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  return (
    <div className="wxbox2">
      <label htmlFor={showPaste ? id : undefined}>{label}</label>
      <div>
        {showPaste ? <textarea id={id} rows={rows} spellCheck={false} autoComplete="off" placeholder={`Paste your own ${label} here`} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={note === '' ? undefined : `${id}-note`} /> : null}
        {note === '' ? null : (
          <div className="age" id={`${id}-note`}>
            {note}
          </div>
        )}
        {inUse === null ? null : (
          <div className="mono rawtext" data-testid={`${id}-in-use`}>
            {inUse}
          </div>
        )}
        <SourceNote id={id} label={label} auto={auto} onResume={onResume} />
        {outcome === null ? null : <ApplyNote outcome={outcome} />}
      </div>
      {showPaste ? (
        <button type="button" className="btn" onClick={() => setOutcome(onApply(text))}>
          Apply
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function Reports({ pack, view, bridge }: { pack: AirportPack; view: ViewData; bridge: DrawerBridge }) {
  const { metar, taf } = view;
  const nothing = metar === null && taf === null;
  const [showPaste, setShowPaste] = useState(false);
  return (
    <>
      <p className="small">
        The METAR and TAF for {pack.airport.weatherStation} are fetched automatically every {pack.settings.weatherPollMinutes} minutes. Reports are not stored.
        {nothing ? <b className="nowx"> No weather entered.</b> : null}{' '}
        {showPaste ? 'Pasting a report replaces the fetched one and pauses automatic updates for it until you press Resume automatic. ' : null}
      </p>
      <button type="button" className="btn" aria-expanded={showPaste} onClick={() => setShowPaste(!showPaste)}>
        {showPaste ? 'Hide paste boxes' : 'Use my own weather'}
      </button>
      <Box id="wx-metar" label="METAR" rows={2} note={metar === null ? `Station ${pack.airport.weatherStation}. No METAR entered.` : ''} inUse={metar === null ? null : metar.raw} auto={bridge.auto.metar} showPaste={showPaste} onApply={bridge.onApplyMetar} onResume={() => bridge.onResume('metar')} />
      <Box id="wx-taf" label="TAF" rows={3} note={taf === null ? `Station ${pack.airport.weatherStation}. No TAF entered.` : ''} inUse={taf === null ? null : taf.raw} auto={bridge.auto.taf} showPaste={showPaste} onApply={bridge.onApplyTaf} onResume={() => bridge.onResume('taf')} />
      <p className="small credit">{WEATHER_CREDIT}</p>
    </>
  );
}

// ---------------------------------------------------------------------- key
function Key() {
  const k = keyModel();
  return (
    <>
      <div className="states">
        {k.states.map((s) => (
          <div key={s.band.id} className={`state-key state-${s.band.tone}`}>
            <StateGlyph glyph={s.band.glyph} /> {s.band.word}: {s.meaning}
          </div>
        ))}
      </div>
      <div className="keyline">
        {k.legend.map((l) => (
          <span key={l.key}>
            {l.key === 'suitable' || l.key === 'unsuitable' || l.key === 'unknown' ? (
              <>
                <i className={`sw ${l.key === 'suitable' ? 'cs-suitable' : l.key === 'unsuitable' ? 'cs-unsuitable' : 'cs-unknown'}`} aria-hidden="true" />
                {LEGEND_GLYPH[l.key]}{' '}
              </>
            ) : null}
            {l.text}
          </span>
        ))}
        {k.runwayKey.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <p className="small">
        Cause words:{' '}
        {k.causes.map((c, i) => (
          <span key={c.code}>
            {i === 0 ? '' : '; '}
            <b>{c.code}</b> {c.word}
          </span>
        ))}
        .
      </p>
    </>
  );
}

// ----------------------------------------------------------------- settings
function Rows({ rows }: { rows: readonly { label: string; value: string; help: string | null }[] }) {
  return (
    <dl className="v">
      {rows.map((r) => (
        <div key={r.label} className="vrow">
          <dt>
            {r.label}
            {r.help === null ? null : <div className="small">{r.help}</div>}
          </dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Settings({ view, displayNowMs, bridge }: { view: ViewData; displayNowMs: number; bridge: DrawerBridge }) {
  const { pack } = view;
  const [confirmClear, setConfirmClear] = useState(false);
  const m = settingsModel(pack, displayNowMs);
  const rows = auditRows(bridge.audit);
  const reload = bridge.reload;
  return (
    <>
      <p className="small">
        {READ_ONLY_NOTE} <span className="small">{pack.airport.icao} pack.</span>
      </p>
      {m.sections.map((sec, i) => (
        <details key={sec.id} open={i === 0}>
          <summary>
            {sec.title} {sec.simulation ? <span className="sim">{SIMULATION_LABEL}</span> : null}
          </summary>
          <Rows rows={sec.rows} />
        </details>
      ))}
      <details>
        <summary>
          Operating plan priorities <span className="sim">{SIMULATION_LABEL}</span>
        </summary>
        <p className="small">{m.planNote}</p>
        {m.plan.map((b) => (
          <div key={b.id} className="plan-band">
            {b.allDay ? null : (
              <b>
                Band {b.id}: {b.times}
              </b>
            )}
            <ul>
              {b.groups.map((g) => (
                <li key={g.rank}>
                  Priority {g.rank} ({g.word}): {g.modes.map((x) => `Mode ${x}`).join(', ')}
                </li>
              ))}
              {b.notAllowed.length === 0 ? null : <li>Not allowed: {b.notAllowed.map((x) => `Mode ${x}`).join(', ')}</li>}
            </ul>
          </div>
        ))}
      </details>
      <details>
        <summary>Time zone</summary>
        <Rows rows={m.zone} />
      </details>
      <details>
        <summary>Airport and data</summary>
        <p className="small">{m.airportNote}</p>
        <div className="act">
          <button type="button" className="btn" onClick={bridge.onReload} disabled={reload.status === 'busy'}>
            Reload data
          </button>
        </div>
        <p className="small">{m.reloadNote}</p>
        {reload.status === 'busy' ? (
          <p role="status" className="small">
            Reloading
          </p>
        ) : null}
        {reload.status === 'refused' ? (
          <div className="refused" role="alert">
            <b>Reload refused. The previous valid data stays in use.</b>
            <pre className="reload-msg">{reload.message}</pre>
          </div>
        ) : null}
        {reload.status === 'changed' || reload.status === 'unchanged' ? (
          <p role="status" className="small">
            {reload.message}
          </p>
        ) : null}
      </details>
      <details>
        <summary>
          Audit trail <span className="small">&nbsp;local record, not tamper-proof</span>
        </summary>
        <p className="small">{m.auditNote}</p>
        {rows.length === 0 ? (
          <p className="small" data-testid="audit-empty">
            {m.auditEmpty}
          </p>
        ) : (
          <table className="tb" data-testid="audit-table">
            <thead>
              <tr>
                <th scope="col">Time (UTC)</th>
                <th scope="col">Changed</th>
                <th scope="col">Old</th>
                <th scope="col">New</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.time}</td>
                  <td>{r.what}</td>
                  <td>{r.old}</td>
                  <td>{r.new}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="act">
          <button
            type="button"
            className="btn"
            disabled={rows.length === 0}
            onClick={() => {
              const file = bridge.onExportAudit();
              downloadText(file.filename, file.text);
            }}
          >
            Export audit trail
          </button>
          <button type="button" className="btn" disabled={rows.length === 0} onClick={() => setConfirmClear(true)}>
            Clear audit trail
          </button>
        </div>
        {confirmClear ? (
          <div className="refused" role="alert">
            <b>Clear the whole audit trail? This cannot be undone.</b>{' '}
            <button
              type="button"
              className="btn small"
              onClick={() => {
                bridge.onClearAudit();
                setConfirmClear(false);
              }}
            >
              Yes, clear it
            </button>{' '}
            <button type="button" className="btn small" onClick={() => setConfirmClear(false)}>
              Keep it
            </button>
          </div>
        ) : null}
      </details>
    </>
  );
}

// ------------------------------------------------------------------ the lot
function jumpTo(id: string): void {
  const heading = document.getElementById(`${id}-title`);
  heading?.scrollIntoView({ block: 'start' });
  heading?.focus();
}

export function DrawerContent({ bridge }: { bridge: DrawerBridge }) {
  const { view } = bridge;
  return (
    <>
      <nav className="dnav" aria-label="Details sections">
        {DRAWER_SECTIONS.map((s) => (
          <button key={s.id} type="button" className="btn small" onClick={() => jumpTo(s.id)}>
            {s.title}
          </button>
        ))}
      </nav>
      <section id="drawer-why" aria-labelledby="drawer-why-title" data-testid="section-why">
        <h3 id="drawer-why-title" tabIndex={-1}>
          Why
        </h3>
        <Why view={view} />
      </section>
      <section id="drawer-reports" aria-labelledby="drawer-reports-title" data-testid="section-reports">
        <h3 id="drawer-reports-title" tabIndex={-1}>
          Reports
        </h3>
        <Reports pack={view.pack} view={view} bridge={bridge} />
      </section>
      <section id="drawer-key" aria-labelledby="drawer-key-title" data-testid="section-key">
        <h3 id="drawer-key-title" tabIndex={-1}>
          Key
        </h3>
        <Key />
      </section>
      <section id="drawer-settings" aria-labelledby="drawer-settings-title" data-testid="section-settings">
        <h3 id="drawer-settings-title" tabIndex={-1}>
          Settings
        </h3>
        <Settings view={view} displayNowMs={bridge.displayNowMs} bridge={bridge} />
      </section>
    </>
  );
}
