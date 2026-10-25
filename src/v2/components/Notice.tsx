// The fixed notice, always drawn, as text only (SEC-1, SEC-2).
import type { AirportPack } from '../../refdata';
import { extraNoticeOf, FLIGHT_SIM_NOTICE } from '../model/notice';

export function Notice({ pack }: { pack: AirportPack | null }) {
  const extra = extraNoticeOf(pack);
  return (
    <span className="notice" role="note">
      {FLIGHT_SIM_NOTICE}
      {extra === null ? null : <span className="notice-extra"> {extra}</span>}
    </span>
  );
}
