// Eligibility matrix: mode x slot (REQUIREMENTS OP-4, WC-1 to WC-13, TR-6;
// DESIGN section 6B). Every rule is evaluated in the fixed order
// MODE, PLAN, TW, XW, CAP; every reason is kept; the status is the worst.
// Every limit and threshold is read from the pack. Pure.
import type { AirportPack, Mode, PlanBand } from '../refdata/types';
import type { SlotWeather, TrafficSlot, WeatherOverlay, WeatherSlot, WindObservation } from './inputs';
import type { Cell, FigureValue, Reason, RunwayFigures, RunwayState, Status } from './types';
import { isFullCircle, isUsableWind, nearLimit, runwayWind, withinLimit } from './wind';

const MS_PER_HOUR = 3_600_000;

// Whole knots for the reason text a person reads (owner decision 24-10-2026,
// amending WC-3's earlier one-decimal rule). The numbers compared against
// limits above (`limit`, `figures`) keep full precision; this only formats
// the sentence.
const f1 = (n: number): string => Math.round(n).toString();

interface UsedRunway {
  readonly name: string;
  readonly headingDegrees: number;
  readonly roles: ('ARRIVAL' | 'DEPARTURE')[];
}

/** The distinct runway ends a mode uses, arrivals first, in the mode's own order. */
export function runwaysOfMode(pack: AirportPack, mode: Mode): UsedRunway[] {
  const used: UsedRunway[] = [];
  const add = (name: string, role: 'ARRIVAL' | 'DEPARTURE'): void => {
    const existing = used.find((u) => u.name === name);
    if (existing !== undefined) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
      return;
    }
    const end = pack.runways.find((r) => r.name === name);
    if (end === undefined) return;
    used.push({ name, headingDegrees: end.headingDegrees, roles: [role] });
  };
  for (const name of mode.arrivals) add(name, 'ARRIVAL');
  for (const name of mode.departures) add(name, 'DEPARTURE');
  return used;
}

/** What the wind rules found for one wind, one mode and one runway state. */
export interface WindAssessment {
  readonly runways: RunwayFigures[];
  readonly tw: Reason[];
  readonly xw: Reason[];
  /** VRB marginal reason (at most one). */
  readonly vrb: Reason[];
  /** Some FAIL reason exists: the mode is UNSUITABLE under this wind. */
  readonly hasFail: boolean;
  /** Fails only when the runway is wet (WET_POSSIBLE with the dry case passing). */
  readonly wetOnlyFail: boolean;
}

export function assessWind(
  pack: AirportPack,
  mode: Mode,
  used: readonly UsedRunway[],
  wind: WindObservation,
  state: RunwayState,
): WindAssessment {
  const s = pack.settings;
  const tol = s.limitToleranceKt;
  const twDry = s.tailwindDryKt;
  const twWet = s.tailwindWetKt;
  const xwLimit = mode.maxCrosswindKt;
  const tw: Reason[] = [];
  const xw: Reason[] = [];
  const vrb: Reason[] = [];
  const runways: RunwayFigures[] = [];
  let hasFail = false;
  let wetOnlyFail = false;

  // A full-circle direction range (000V360) has no usable direction: treat it as VRB.
  const judged: WindObservation =
    wind.kind === 'steady' && wind.variableRangeDegrees !== null && isFullCircle(wind.variableRangeDegrees[0], wind.variableRangeDegrees[1])
      ? { kind: 'variable', speedKt: wind.speedKt, gustKt: wind.gustKt }
      : wind;
  const winds = used.map((u) => ({ u, w: runwayWind(judged, u.headingDegrees, s.calmWindKt) }));
  for (const { u, w } of winds) {
    runways.push({
      runway: u.name,
      headingDegrees: u.headingDegrees,
      roles: u.roles,
      directionDegrees: w.directionDegrees,
      speedKt: w.speedKt,
      calm: w.calm,
      variableAboveCalm: w.variableAboveCalm,
      headwindKt: w.headwindKt,
      tailwindKt: w.tailwindKt,
      crosswindKt: w.crosswindKt,
      tailwindLimitDryKt: twDry,
      tailwindLimitWetKt: twWet,
      crosswindLimitKt: xwLimit,
    });
  }

  const caseNames: ('dry' | 'wet')[] = state === 'DRY' ? ['dry'] : state === 'WET' ? ['wet'] : ['dry', 'wet'];
  const limitOf = (c: 'dry' | 'wet'): number => (c === 'dry' ? twDry : twWet);

  const variable = winds.length > 0 && winds.every(({ w }) => w.variableAboveCalm);
  if (variable) {
    // Variable wind above calm (WC-11, OD-27): MARGINAL, unless the full speed breaks a
    // limit on every runway the mode uses. Owner decision 23-10-2026: variable wind is
    // ignored for wet-runway decisions, so the deciding tailwind limit is ALWAYS the dry
    // one (tailwindDryKt), whatever the runway state; the wet limit is never applied to it.
    const decisive = twDry;
    const speed = winds[0]?.w.speedKt ?? 0;
    const breaks = winds.map(({ w }) => ({
      tail: !withinLimit(w.tailwindKt, decisive, tol),
      cross: !withinLimit(w.crosswindKt, xwLimit, tol),
    }));
    const everyBreaks = breaks.every((b) => b.tail || b.cross);
    let wetCaseBreaksAll = false;
    if (state === 'WET_POSSIBLE') {
      wetCaseBreaksAll = winds.every(({ w }) => !withinLimit(w.tailwindKt, twWet, tol) || !withinLimit(w.crosswindKt, xwLimit, tol));
    }
    if (everyBreaks) {
      hasFail = true;
      winds.forEach(({ u, w }, i) => {
        const b = breaks[i];
        if (b?.tail) {
          tw.push({
            code: 'TW',
            severity: 'FAIL',
            runway: u.name,
            figures: { speedKt: w.speedKt, tailwindKt: w.tailwindKt, variable: true, case: state === 'WET' ? 'wet' : 'dry' },
            limit: decisive,
            text: `Variable wind of ${f1(w.speedKt)} kt could be a tailwind on runway ${u.name}, above the limit of ${f1(decisive)} kt`,
          });
        }
        if (b?.cross) {
          xw.push({
            code: 'XW',
            severity: 'FAIL',
            runway: u.name,
            figures: { speedKt: w.speedKt, crosswindKt: w.crosswindKt, variable: true },
            limit: xwLimit,
            text: `Variable wind of ${f1(w.speedKt)} kt could be a crosswind on runway ${u.name}, above this mode's limit of ${f1(xwLimit)} kt`,
          });
        }
      });
    }
    vrb.push({
      code: 'VRB',
      severity: 'MARGINAL',
      figures: { speedKt: speed, calmWindKt: s.calmWindKt, breaksOnEveryRunway: everyBreaks, wetCaseBreaksOnEveryRunway: wetCaseBreaksAll, uncertain: true },
      limit: s.calmWindKt,
      text: `Variable wind of ${f1(speed)} kt is above the calm threshold of ${f1(s.calmWindKt)} kt, so the direction is unknown`,
    });
    return { runways, tw, xw, vrb, hasFail, wetOnlyFail };
  }

  for (const { u, w } of winds) {
    // Tailwind (rule 3).
    const failedCases = caseNames.filter((c) => !withinLimit(w.tailwindKt, limitOf(c), tol));
    const base = { speedKt: w.speedKt, directionDegrees: w.directionDegrees, tailwindKt: w.tailwindKt, headwindKt: w.headwindKt };
    if (state === 'WET_POSSIBLE') {
      if (failedCases.includes('dry')) {
        hasFail = true;
        tw.push({
          code: 'TW',
          severity: 'FAIL',
          runway: u.name,
          figures: { ...base, case: 'dry' },
          limit: twDry,
          text: `Tailwind ${f1(w.tailwindKt)} kt on runway ${u.name} exceeds the dry limit of ${f1(twDry)} kt`,
        });
        continue;
      }
      if (failedCases.includes('wet')) {
        wetOnlyFail = true;
        tw.push({
          code: 'TW',
          severity: 'MARGINAL',
          runway: u.name,
          figures: { ...base, case: 'wet', uncertain: true },
          limit: twWet,
          text: `Tailwind ${f1(w.tailwindKt)} kt on runway ${u.name} passes if dry but exceeds the wet limit of ${f1(twWet)} kt, and the runway may be wet`,
        });
        continue;
      }
    } else if (failedCases.length > 0) {
      const c = caseNames[0] ?? 'dry';
      hasFail = true;
      tw.push({
        code: 'TW',
        severity: 'FAIL',
        runway: u.name,
        figures: { ...base, case: c },
        limit: limitOf(c),
        text: `Tailwind ${f1(w.tailwindKt)} kt on runway ${u.name} exceeds the ${c} limit of ${f1(limitOf(c))} kt`,
      });
      continue;
    }
    // Passes. Near-limit margin against the tightest applicable limit that it is near.
    let nearCase: 'dry' | 'wet' | null = null;
    for (const c of caseNames) {
      if (!nearLimit(w.tailwindKt, limitOf(c), s.nearLimitMarginKt, tol)) continue;
      if (nearCase === null || limitOf(c) < limitOf(nearCase)) nearCase = c;
    }
    if (nearCase !== null) {
      tw.push({
        code: 'TW',
        severity: 'MARGINAL',
        runway: u.name,
        figures: { ...base, case: nearCase, near: true },
        limit: limitOf(nearCase),
        text: `Tailwind ${f1(w.tailwindKt)} kt on runway ${u.name} is within ${f1(s.nearLimitMarginKt)} kt of the ${nearCase} limit of ${f1(limitOf(nearCase))} kt`,
      });
    }
  }

  for (const { u, w } of winds) {
    // Crosswind (rule 4), against THIS mode's own limit.
    const base = { speedKt: w.speedKt, directionDegrees: w.directionDegrees, crosswindKt: w.crosswindKt };
    if (!withinLimit(w.crosswindKt, xwLimit, tol)) {
      hasFail = true;
      xw.push({
        code: 'XW',
        severity: 'FAIL',
        runway: u.name,
        figures: base,
        limit: xwLimit,
        text: `Crosswind ${f1(w.crosswindKt)} kt on runway ${u.name} exceeds this mode's limit of ${f1(xwLimit)} kt`,
      });
    } else if (nearLimit(w.crosswindKt, xwLimit, s.nearLimitMarginKt, tol)) {
      xw.push({
        code: 'XW',
        severity: 'MARGINAL',
        runway: u.name,
        figures: { ...base, near: true },
        limit: xwLimit,
        text: `Crosswind ${f1(w.crosswindKt)} kt on runway ${u.name} is within ${f1(s.nearLimitMarginKt)} kt of this mode's limit of ${f1(xwLimit)} kt`,
      });
    }
  }
  return { runways, tw, xw, vrb, hasFail, wetOnlyFail };
}

/** The weather rules for one SlotWeather (used for the slot itself and for the TAF's view of it). */
interface WeatherPart {
  readonly status: Status;
  readonly runways: RunwayFigures[];
  readonly tw: Reason[];
  readonly xw: Reason[];
  readonly vrb: Reason[];
  readonly overlay: Reason[];
}

const rank = (status: Status): number => (status === 'UNSUITABLE' ? 2 : status === 'MARGINAL' ? 1 : 0);

function overlayLabel(o: WeatherOverlay): string {
  return o.probabilityPct === null ? o.kind : `${o.kind} (PROB${o.probabilityPct})`;
}

function weatherPart(pack: AirportPack, mode: Mode, used: readonly UsedRunway[], sw: SlotWeather, state: RunwayState): WeatherPart {
  if (!isUsableWind(sw.wind)) {
    return { status: 'UNKNOWN', runways: [], tw: [], xw: [], vrb: [], overlay: [] };
  }
  const main = assessWind(pack, mode, used, sw.wind, state);
  const overlay: Reason[] = [];
  for (const o of sw.overlays) {
    if (!isUsableWind(o.wind)) {
      // The group gives no usable wind, so it cannot be judged: say so and mark the cell uncertain.
      overlay.push({
        code: 'OVERLAY',
        severity: 'INFO',
        figures: { overlayKind: o.kind, probabilityPct: o.probabilityPct, group: o.text, windKnown: false, uncertain: true },
        limit: null,
        text: `${overlayLabel(o)} group gives no usable wind, so it could not be checked against the limits`,
      });
      continue;
    }
    // Rain inside the group means the runway is wet if the group happens.
    const a = assessWind(pack, mode, used, o.wind, o.precipitation ? 'WET' : state);
    if (!(a.hasFail || a.wetOnlyFail)) continue;
    const inner = a.tw.find((r) => r.severity === 'FAIL') ?? a.xw.find((r) => r.severity === 'FAIL') ?? a.tw.find((r) => r.severity === 'MARGINAL' && r.figures.case === 'wet');
    const figures: Record<string, FigureValue> = { overlayKind: o.kind, probabilityPct: o.probabilityPct, group: o.text, uncertain: true };
    if (inner !== undefined) {
      for (const [k, v] of Object.entries(inner.figures)) figures[k] = v;
    }
    overlay.push({
      code: 'OVERLAY',
      severity: 'MARGINAL',
      ...(inner?.runway === undefined ? {} : { runway: inner.runway }),
      figures,
      limit: inner?.limit ?? null,
      text: `${overlayLabel(o)} group would break this mode: ${inner?.text ?? 'wind outside limits'}`,
    });
  }
  let status: Status = 'SUITABLE';
  if (main.hasFail) status = 'UNSUITABLE';
  else if ([...main.tw, ...main.xw, ...main.vrb, ...overlay].some((r) => r.severity === 'MARGINAL')) status = 'MARGINAL';
  return { status, runways: main.runways, tw: main.tw, xw: main.xw, vrb: main.vrb, overlay };
}

export interface CellContext {
  readonly pack: AirportPack;
  readonly mode: Mode;
  readonly used: readonly UsedRunway[];
  readonly slotIndex: number;
  readonly slot: WeatherSlot;
  readonly runwayState: RunwayState;
  /** The state implied by the TAF's view of the slot, or null. */
  readonly tafState: RunwayState | null;
  readonly band: PlanBand | null;
  readonly traffic: TrafficSlot | null;
}

export function evaluateCell(ctx: CellContext): Cell {
  const { pack, mode, used, slot, runwayState, band, traffic } = ctx;
  const reasons: Reason[] = [];
  const arrivals = traffic?.arrivals ?? null;
  const departures = traffic?.departures ?? null;
  const knownDemand = arrivals === null && departures === null ? null : (arrivals ?? 0) + (departures ?? 0);
  const slotHours = (slot.endMs - slot.startMs) / MS_PER_HOUR;
  const capacityInSlot = mode.capacity === null ? null : mode.capacity * slotHours;
  const demand = { arrivals, departures, capacityPerHour: mode.capacity, capacityInSlot, knownDemand };
  const bandId = band === null ? null : band.id;

  // Rule 1: MODE. A disabled mode is UNSUITABLE with no calculation.
  if (!mode.enabled) {
    reasons.push({ code: 'MODE', severity: 'FAIL', figures: { enabled: false }, limit: null, text: 'Mode is not enabled in the airport data' });
    return { modeId: mode.id, slotIndex: ctx.slotIndex, status: 'UNSUITABLE', cause: 'MODE', reasons, uncertain: false, runwayState, bandId, runways: [], demand };
  }

  // Rule 2: PLAN.
  if (band !== null) {
    const row = band.rows.find((r) => r.mode === mode.id);
    if (row !== undefined && !row.allowed) {
      reasons.push({ code: 'PLAN', severity: 'FAIL', figures: { bandId: band.id }, limit: null, text: `The operating plan does not allow this mode in the "${band.id}" time band` });
    }
  }

  // Rules 3 and 4: wind (TW then XW), plus the marginal wind rules (VRB, overlays).
  const part = weatherPart(pack, mode, used, slot.weather, runwayState);
  const rest: Reason[] = [];
  reasons.push(...part.tw, ...part.xw);

  // Rule 5: CAP.
  let uncertain = false;
  if (mode.capacity !== null && capacityInSlot !== null) {
    if (knownDemand === null) {
      uncertain = true;
      rest.push({ code: 'NO_DEMAND', severity: 'INFO', figures: { capacityPerHour: mode.capacity }, limit: mode.capacity, text: 'Demand is unknown, so the capacity check was skipped' });
    } else if (knownDemand > capacityInSlot) {
      reasons.push({
        code: 'CAP',
        severity: 'FAIL',
        figures: { arrivals, departures, knownDemand, capacityPerHour: mode.capacity, capacityInSlot },
        limit: capacityInSlot,
        text: `Known demand of ${knownDemand} movements exceeds the capacity of ${f1(capacityInSlot)} for this slot (${f1(mode.capacity)} per hour)`,
      });
    }
  }
  reasons.push(...rest, ...part.vrb, ...part.overlay);

  let status: Status;
  if (reasons.some((r) => r.severity === 'FAIL')) status = 'UNSUITABLE';
  else if (part.status === 'UNKNOWN') status = 'UNKNOWN';
  else if (reasons.some((r) => r.severity === 'MARGINAL')) status = 'MARGINAL';
  else status = 'SUITABLE';

  if (part.status === 'UNKNOWN') {
    uncertain = true;
    reasons.push({ code: 'NO_WIND', severity: 'UNKNOWN', figures: { governedBy: slot.governedBy }, limit: null, text: 'No wind is available for this slot' });
  }

  // METAR-governed slot: a worse TAF view makes the cell MARGINAL, with the TAF reason (WX-7).
  if (slot.governedBy === 'METAR' && slot.tafView !== null && (status === 'SUITABLE' || status === 'MARGINAL')) {
    const tafPart = weatherPart(pack, mode, used, slot.tafView, ctx.tafState ?? runwayState);
    if (tafPart.status !== 'UNKNOWN' && rank(tafPart.status) > rank(status)) {
      const inner =
        [...tafPart.tw, ...tafPart.xw].find((r) => r.severity === 'FAIL') ??
        [...tafPart.tw, ...tafPart.xw, ...tafPart.vrb, ...tafPart.overlay].find((r) => r.severity === 'MARGINAL');
      reasons.push({
        code: 'TAF',
        severity: 'MARGINAL',
        ...(inner?.runway === undefined ? {} : { runway: inner.runway }),
        figures: { tafStatus: tafPart.status, tafCause: inner?.code ?? null, ...(inner?.figures ?? {}), uncertain: true },
        limit: inner?.limit ?? null,
        text: `The TAF for this slot would make the mode ${tafPart.status}${inner === undefined ? '' : `: ${inner.text}`}`,
      });
      status = 'MARGINAL';
    }
  }

  if (reasons.some((r) => (r.severity === 'MARGINAL' || r.severity === 'INFO') && r.figures.uncertain === true)) uncertain = true;

  const decisive =
    status === 'UNSUITABLE'
      ? reasons.find((r) => r.severity === 'FAIL')
      : status === 'MARGINAL'
        ? reasons.find((r) => r.severity === 'MARGINAL')
        : status === 'UNKNOWN'
          ? reasons.find((r) => r.severity === 'UNKNOWN')
          : undefined;

  return {
    modeId: mode.id,
    slotIndex: ctx.slotIndex,
    status,
    cause: decisive === undefined ? null : decisive.code,
    reasons,
    uncertain,
    runwayState,
    bandId,
    runways: part.runways,
    demand,
  };
}
