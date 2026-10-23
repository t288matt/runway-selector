// When the current mode was set, and the amber flag when it may be out of date
// (OD-30). The flag always carries words, so colour is never the only signal.
import type { CurrentModeStatus as Status } from '../model/drawer';

export function CurrentModeStatus({ status, onConfirm }: { status: Status; onConfirm: () => void }) {
  if (status.setText === null) return null;
  return (
    <div className={status.stale ? 'cur-status cur-stale' : 'cur-status'}>
      <span>{status.setText}</span>
      {status.staleWords === null ? null : <b className="stale-words"> Possibly out of date: {status.staleWords}.</b>}{' '}
      {status.canConfirm ? (
        <button type="button" className="btn small-btn" onClick={onConfirm}>Still current</button>
      ) : null}
    </div>
  );
}
