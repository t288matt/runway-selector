// The settings drawer (UI_DESIGN "Settings", DB-9, OD-27, RD-6). On screen only
// the current mode and the window can be changed; every other value is read
// from the pack and shown as text (SEC-2). A source is a link only when it
// starts with https: (done in the model). Focus: the heading takes focus on
// opening, Escape closes, and focus returns to what opened the drawer.
import { useEffect, useRef, useState } from 'react';
import type { AuditEntry, AuditExport, CurrentModeRecord } from '../../store';
import { downloadText } from '../download';
import { WINDOW_OPTIONS, isWindowChoice, type ViewData, type WindowChoice } from '../model/dashboard';
import { auditRows, currentModeStatus, drawerModel, SIMULATION_LABEL } from '../model/drawer';
import { currentModeOptions } from '../model/panels';
import type { ReloadState } from '../controller';
import { CurrentModeStatus } from './CurrentModeStatus';

/** What the drawer needs from the controller beyond the view. */
export interface SettingsBridge {
  readonly currentModeRecord: CurrentModeRecord | null;
  readonly audit: readonly AuditEntry[];
  readonly reload: ReloadState;
  /** Airport ids listed in app.json, offered as suggestions in the header's airport box (OD-37). */
  readonly airports: readonly string[];
  readonly airportError: string | null;
  readonly notices: readonly string[];
  readonly onConfirmCurrent: () => void;
  readonly onReload: () => void;
  readonly onSwitchAirport: (icao: string) => void;
  readonly onClearAudit: () => void;
  readonly onExportAudit: () => AuditExport;
  readonly onDismissNotice: (index: number) => void;
}

export interface SettingsDrawerProps {
  readonly view: ViewData;
  readonly displayNowMs: number;
  readonly bridge: SettingsBridge;
  readonly onCurrentMode: (id: string | null) => void;
  readonly onWindowChange: (choice: WindowChoice) => void;
  readonly onClose: () => void;
}

function Rows({ rows }: { rows: readonly { label: string; value: string; help: string | null }[] }) {
  return (
    <table className="t2">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>
              {r.label}
              {r.help === null ? null : <div className="small">{r.help}</div>}
            </td>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SettingsDrawer({ view, displayNowMs, bridge, onCurrentMode, onWindowChange, onClose }: SettingsDrawerProps) {
  const { pack } = view;
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener !== null && opener.isConnected) opener.focus();
    };
  }, []);

  const model = drawerModel(pack, displayNowMs);
  const status = currentModeStatus(bridge.currentModeRecord, displayNowMs, pack);
  const rows = auditRows(bridge.audit, pack);
  const reload = bridge.reload;

  return (
    <aside id="drawer" role="dialog" aria-modal="false" aria-labelledby="drawer-title">
      <div className="drawer-head">
        <h2 id="drawer-title" tabIndex={-1} ref={headingRef}>{model.title}</h2>
        <span className="sp" />
        <button type="button" className="btn" onClick={onClose}>Close settings</button>
      </div>
      <p className="small">{model.onScreenNote}</p>

      <h3>Current mode and window</h3>
      <div className="drawer-field">
        <label htmlFor="drawer-current-mode">Current mode (you choose)</label>
        <select id="drawer-current-mode" value={view.currentMode ?? ''} onChange={(e) => onCurrentMode(e.target.value === '' ? null : e.target.value)}>
          {currentModeOptions(view).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <CurrentModeStatus status={status} onConfirm={bridge.onConfirmCurrent} />
        <p className="small">Changing the current mode recalculates the recommendation at once and is added to the audit trail below.</p>
      </div>
      <div className="drawer-field">
        <label htmlFor="drawer-window">Window</label>
        <select id="drawer-window" value={view.windowChoice} onChange={(e) => (isWindowChoice(e.target.value) ? onWindowChange(e.target.value) : undefined)}>
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>

      {model.sections.map((sec) => (
        <section key={sec.id} aria-labelledby={`drawer-${sec.id}`}>
          <h3 id={`drawer-${sec.id}`}>
            {sec.title} {sec.simulation ? <span className="sim">{SIMULATION_LABEL}</span> : null}
          </h3>
          <Rows rows={sec.rows} />
        </section>
      ))}

      <section aria-labelledby="drawer-plan">
        <h3 id="drawer-plan">Operating plan priorities <span className="sim">{SIMULATION_LABEL}</span></h3>
        <p className="small">{model.planNote}</p>
        {model.plan.map((b) => (
          <div key={b.id} className="plan-band">
            {b.allDay ? null : <b>Band {b.id}: {b.times}</b>}
            <ul>
              {b.groups.map((g) => (
                <li key={g.rank}>
                  Priority {g.rank} ({g.word}): {g.modes.map((m) => `Mode ${m}`).join(', ')}
                </li>
              ))}
              {b.notAllowed.length === 0 ? null : <li>Not allowed: {b.notAllowed.map((m) => `Mode ${m}`).join(', ')}</li>}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="drawer-zone">
        <h3 id="drawer-zone">Time zone</h3>
        <Rows rows={model.zone} />
      </section>

      <section aria-labelledby="drawer-status">
        <h3 id="drawer-status">Status of the airport data</h3>
        <ul className="prov">
          {model.provenance.map((p) => (
            <li key={p.label}>
              {p.label}: {p.status}.
              {p.source === null ? null : p.link === null ? (
                <> Source: {p.source}</>
              ) : (
                <>
                  {' '}
                  Source: <a href={p.link} rel="noopener noreferrer" target="_blank">{p.link}</a>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="drawer-data">
        <h3 id="drawer-data">Airport and data</h3>
        <p className="small">
          To change airport, type its code in the Airport box at the top of the screen. Only airports with a reviewed data pack can be shown ({bridge.airports.join(', ')}). Each airport keeps its own current mode, window and audit trail.
        </p>
        <button type="button" className="btn" onClick={bridge.onReload} disabled={reload.status === 'busy'}>Reload data</button>
        <p className="small">Reload data re-reads and re-checks the airport files. A file that fails the check is refused and the previous valid data stays in use.</p>
        {reload.status === 'busy' ? <p role="status" className="small">Reloading</p> : null}
        {reload.status === 'refused' ? (
          <div className="strip strip-bad" role="alert">
            <b>Reload refused. The previous valid data stays in use.</b>
            <pre className="reload-msg">{reload.message}</pre>
          </div>
        ) : null}
        {reload.status === 'changed' || reload.status === 'unchanged' ? <p role="status" className="small">{reload.message}</p> : null}
      </section>

      <section aria-labelledby="drawer-audit">
        <h3 id="drawer-audit">Audit trail <span className="small">local record, not tamper-proof</span></h3>
        <p className="small">
          Kept in this browser. It records changes to the current mode and the window only, newest first, and keeps the last {pack.settings.auditMaxEntries} entries. Changes to the airport data files are not recorded here.
        </p>
        {rows.length === 0 ? (
          <p className="small">No changes yet. Change the current mode or the window to see an entry.</p>
        ) : (
          <table className="t2">
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
        <div className="drawer-actions">
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
          <button type="button" className="btn" disabled={rows.length === 0} onClick={() => setConfirmClear(true)}>Clear audit trail</button>
        </div>
        {confirmClear ? (
          <div className="strip strip-warn" role="alert">
            <b>Clear the whole audit trail? This cannot be undone.</b>{' '}
            <button
              type="button"
              className="btn"
              onClick={() => {
                bridge.onClearAudit();
                setConfirmClear(false);
              }}
            >
              Yes, clear it
            </button>{' '}
            <button type="button" className="btn" onClick={() => setConfirmClear(false)}>Keep it</button>
          </div>
        ) : null}
      </section>
    </aside>
  );
}
