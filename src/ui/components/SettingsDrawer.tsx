// Minimal read-only settings drawer (UI_DESIGN section 5, "Settings"). It is a
// stub: the full drawer, reload of the pack and the audit trail are added in a
// later step. Pack text is shown as plain text; a source is a link only when it
// starts with https: (SEC-2).
import { useEffect, useRef } from 'react';
import type { AirportPack, SettingName } from '../../refdata';
import { kt1, safeHttpsLink } from '../format';

interface Row {
  readonly name: SettingName;
  readonly label: string;
  readonly value: string;
}

function rowsOf(pack: AirportPack): Row[] {
  const s = pack.settings;
  return [
    { name: 'tailwindDryKt', label: 'Tailwind, dry runway', value: `${kt1(s.tailwindDryKt)} kt` },
    { name: 'tailwindWetKt', label: 'Tailwind, wet runway', value: `${kt1(s.tailwindWetKt)} kt` },
    { name: 'defaultCrosswindKt', label: 'Default crosswind limit', value: `${kt1(s.defaultCrosswindKt)} kt` },
    { name: 'calmWindKt', label: 'Calm wind', value: `${kt1(s.calmWindKt)} kt` },
    { name: 'limitToleranceKt', label: 'Limit tolerance', value: `${s.limitToleranceKt} kt` },
    { name: 'wetRunwayProbabilityPct', label: 'Wet if PROB at or above', value: `${s.wetRunwayProbabilityPct} %` },
    { name: 'dryingTimeMinutes', label: 'Drying time', value: `${s.dryingTimeMinutes} min` },
  ];
}

export function SettingsDrawer({ pack, onClose }: { pack: AirportPack; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const source = pack.meta.settings.source === null ? null : safeHttpsLink(pack.meta.settings.source);
  return (
    <aside id="drawer" aria-label="Settings">
      <div className="drawer-head">
        <b>Settings</b>
        <span className="sp" />
        <button type="button" className="btn" ref={closeRef} onClick={onClose}>Close</button>
      </div>
      <p className="small">Read only for now. On screen you can change only the current mode and the window; every other value is edited in the pack files.</p>
      <h3>Limits <span className="sim">Simulation setting</span></h3>
      <table className="t2">
        <tbody>
          {rowsOf(pack).map((r) => (
            <tr key={r.name}>
              <td>
                {r.label}
                <div className="small">{pack.descriptions[r.name]}</div>
              </td>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        Status of the settings: {pack.meta.settings.status ?? 'not stated'}.
        {source === null ? null : (
          <>
            {' '}
            Source: <a href={source} rel="noopener noreferrer" target="_blank">{source}</a>
          </>
        )}
      </p>
    </aside>
  );
}
