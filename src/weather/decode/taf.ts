// TAF adapter: pasted text in, our DecodedTaf (or "no TAF", or a plain error) out.
import { parseTAF } from 'metar-taf-parser';
import type { TAFTrend } from 'metar-taf-parser';
import type { DecodeContext, DecodeResult, DecodeWarning, DecodedConditions, DecodedTaf, TafOverlayGroup, TafPeriod } from '../types';
import { convertConditions, repairSixteenth } from './convert';
import { parseTafHeader, splitMixedFractions } from './header';
import { cleanReportText } from './input';
import { clip, droppedGroupWarning, groupWarnings, overlongToken, scanGroup, tokenise, tokensMissingFromGroups, windDisagreement } from './tokens';
import { resolveNearest, resolveOnOrAfter, resolveRecent } from './time';

const HOUR_MS = 3_600_000;
/** The longest forecast we accept (the largest forecast window the pack loader allows, 2160 minutes). Real TAFs run 9 to 30 hours. */
const MAX_VALIDITY_MS = 36 * HOUR_MS;

interface Parsed {
  readonly kind: 'FM' | 'BECMG' | 'TEMPO' | 'INTER' | 'PROB';
  readonly probabilityPct: 30 | 40 | null;
  readonly startMs: number;
  readonly endMs: number;
  readonly conditions: DecodedConditions;
  readonly weatherGroupGiven: boolean;
  readonly text: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function skipHeader(tokens: readonly string[]): readonly string[] {
  let i = 0;
  while (tokens[i] === 'TAF') i++;
  if (tokens[i] === 'AMD' || tokens[i] === 'COR') i++;
  i += 2;
  if (/^\d{4}\/\d{4}$/.test(tokens[i] ?? '')) i++;
  return tokens.slice(i);
}

/** Carry the previous period's visibility and cloud forward when an FM or BECMG group does not state its own (the library returns only the fields in the group). */
function mergePeriod(prev: DecodedConditions, own: DecodedConditions, weatherGroupGiven: boolean, kind: 'FM' | 'BECMG'): DecodedConditions {
  const ownSky = own.clouds.length > 0 || own.cavok || own.verticalVisibilityFt !== null;
  const ownVisibility = own.visibility !== null;
  // FM starts a new prevailing state, so weather is not carried (an FM group
  // omits weather that is not significant). BECMG changes only what it states.
  const weather = kind === 'FM' || weatherGroupGiven || own.cavok ? own.weather : prev.weather;
  return {
    wind: own.wind ?? prev.wind,
    visibility: own.visibility ?? prev.visibility,
    cavok: own.cavok || (prev.cavok && !ownSky && !ownVisibility && !weatherGroupGiven),
    clouds: ownSky ? own.clouds : prev.clouds,
    verticalVisibilityFt: ownSky ? own.verticalVisibilityFt : prev.verticalVisibilityFt,
    weather,
  };
}

export function decodeTaf(raw: string, ctx: DecodeContext): DecodeResult<DecodedTaf> {
  const cleaned = cleanReportText(raw, 'The TAF');
  if (!cleaned.ok) return { kind: 'error', message: cleaned.message };
  const text = splitMixedFractions(cleaned.text);
  const tokens = tokenise(text);

  const parsed = parseTafHeader(tokens);
  if (!parsed.ok) return { kind: 'error', message: parsed.message };
  const h = parsed.header;

  const expected = ctx.pack.airport.weatherStation;
  if (h.station !== expected) {
    return { kind: 'error', message: `This TAF is for station ${h.station}, but this airport uses station ${expected}. It was not used.` };
  }
  const issuedAtMs = resolveRecent(h.day, h.hour, h.minute, ctx.nowMs);
  if (issuedAtMs === null) {
    return { kind: 'error', message: `The issue time ${pad(h.day)}${pad(h.hour)}${pad(h.minute)}Z does not match any real date.` };
  }
  // A NIL TAF (no forecast issued) and a cancelled TAF both mean "no TAF". The library throws on the first.
  if (h.next === 'NIL') return { kind: 'none', reason: 'nil', station: h.station, warnings: [] };
  if (h.next === 'CNL') return { kind: 'none', reason: 'cancelled', station: h.station, warnings: [] };

  const overlong = overlongToken(tokens);
  if (overlong !== null) {
    return { kind: 'error', message: `The TAF contains a group that is far too long to be real ("${clip(overlong)}", ${overlong.length} characters). Nothing was read.` };
  }
  // Used only to name the offending groups if the library refuses the text.
  const wholeScan = scanGroup(skipHeader(tokens), { taf: true });
  let lib;
  try {
    lib = parseTAF(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    const where = wholeScan.unknown.length > 0 ? ` Groups not recognised: ${wholeScan.unknown.slice(0, 6).map(clip).join(', ')}.` : ' No single group could be pointed to; check the report is a complete TAF.';
    return { kind: 'error', message: `The TAF could not be read (the decoder said "${reason}").${where} The previous report, if any, stays in use.` };
  }
  if (lib.nil === true) return { kind: 'none', reason: 'nil', station: h.station, warnings: [] };
  if (lib.canceled === true) return { kind: 'none', reason: 'cancelled', station: h.station, warnings: [] };

  // Validity: the start date nearest the issue time, the end on or after the start.
  const v = lib.validity;
  const validFromMs = resolveNearest(v.startDay, v.startHour, 0, issuedAtMs, true);
  const validToMs = validFromMs === null ? null : resolveOnOrAfter(v.endDay, v.endHour, 0, validFromMs, true);
  if (validFromMs === null || validToMs === null || validToMs <= validFromMs) {
    return { kind: 'error', message: `The TAF validity period ${pad(v.startDay)}${pad(v.startHour)}/${pad(v.endDay)}${pad(v.endHour)} is not a valid period.` };
  }
  if (validToMs - validFromMs > MAX_VALIDITY_MS) {
    return { kind: 'error', message: `The TAF validity period ${pad(v.startDay)}${pad(v.startHour)}/${pad(v.endDay)}${pad(v.endHour)} is longer than 36 hours.` };
  }

  const scan = scanGroup(skipHeader(tokenise(lib.initialRaw)), { taf: true });
  if (scan.counts.wind > 0 && lib.wind === undefined) {
    return { kind: 'error', message: `The TAF could not be read: the wind group ${scan.counts.windTokens.map(clip).join(', ')} in the base group was not understood. A report whose wind cannot be read is not used.` };
  }
  const baseDisagree = windDisagreement(scan, lib.wind);
  if (baseDisagree !== null) {
    return { kind: 'error', message: `The TAF could not be read: ${baseDisagree} (base group). A report whose wind cannot be read is not used.` };
  }
  const baseConvRaw = convertConditions(lib, 'TAF base group');
  if (!baseConvRaw.ok) return { kind: 'error', message: `The TAF could not be read: ${baseConvRaw.message}` };
  const baseFix = repairSixteenth(baseConvRaw.value.conditions, scan.sixteenths);
  const baseConv = { value: { conditions: baseFix.conditions } };

  const warnings: DecodeWarning[] = [];
  warnings.push(...groupWarnings(scan, { hasWind: lib.wind !== undefined, hasVisibility: lib.visibility !== undefined || scan.sixteenths > 0, clouds: lib.clouds.length, weather: lib.weatherConditions.length }, 'TAF base group'));
  const reportedTokens = new Set<string>(scan.unknown);

  const groups: Parsed[] = [];
  for (const t of lib.trends as TAFTrend[]) {
    const label = `TAF group "${t.raw.length > 40 ? `${t.raw.slice(0, 40)}...` : t.raw}"`;
    const gTokens = tokenise(t.raw);
    const gScan = scanGroup(gTokens, { taf: true });
    for (const u of gScan.unknown) reportedTokens.add(u);
    warnings.push(...groupWarnings(gScan, { hasWind: t.wind !== undefined, hasVisibility: t.visibility !== undefined || gScan.sixteenths > 0, clouds: t.clouds.length, weather: t.weatherConditions.length }, label));

    if (gScan.counts.wind > 0 && t.wind === undefined) {
      return { kind: 'error', message: `The TAF could not be read: the wind group ${gScan.counts.windTokens.map(clip).join(', ')} in ${label} was not understood. A report whose wind cannot be read is not used.` };
    }
    const groupDisagree = windDisagreement(gScan, t.wind);
    if (groupDisagree !== null) {
      return { kind: 'error', message: `The TAF could not be read: ${groupDisagree} in ${label}. A report whose wind cannot be read is not used.` };
    }
    const convRaw = convertConditions(t, label);
    if (!convRaw.ok) return { kind: 'error', message: `The TAF could not be read: ${convRaw.message}` };
    const groupFix = repairSixteenth(convRaw.value.conditions, gScan.sixteenths);
    const conv = { value: { conditions: groupFix.conditions, weatherGroupGiven: convRaw.value.weatherGroupGiven } };
    if (groupFix.repaired) warnings.push({ code: 'visibility-repaired', message: `${label}: visibility 1/16SM could not be read by the decoder and is taken as 100 m.` });

    const tv = t.validity;
    const hasEnd = 'endDay' in tv && tv.endDay !== undefined;
    let startMs: number | null;
    if (t.type === 'FM') {
      startMs = resolveNearest(tv.startDay, tv.startHour, 'startMinutes' in tv && tv.startMinutes !== undefined ? tv.startMinutes : 0, validFromMs, true);
    } else {
      startMs = resolveNearest(tv.startDay, tv.startHour, 0, validFromMs, true);
    }
    let endMs: number | null = validToMs;
    if (t.type !== 'FM' && hasEnd) {
      const e = tv as { endDay: number; endHour: number };
      endMs = startMs === null ? null : resolveOnOrAfter(e.endDay, e.endHour, 0, startMs, true);
    }
    if (startMs === null || endMs === null) {
      return { kind: 'error', message: `The TAF group "${clip(t.raw)}" has a time that is not valid.` };
    }
    if (startMs >= validToMs || endMs <= validFromMs) {
      warnings.push({ code: 'group-outside-validity', message: `${label} is outside the TAF validity period and was ignored.` });
      continue;
    }
    if (startMs < validFromMs) {
      warnings.push({ code: 'group-outside-validity', message: `${label} starts before the TAF validity period; it was moved to the start of the validity.` });
      startMs = validFromMs;
    }
    if (endMs <= startMs) {
      warnings.push({ code: 'group-outside-validity', message: `${label} ends before it starts and was ignored.` });
      continue;
    }
    const probability = t.probability === 30 || t.probability === 40 ? t.probability : null;
    let kind: Parsed['kind'];
    if (t.type === 'FM') kind = 'FM';
    else if (t.type === 'BECMG' && probability === null) kind = 'BECMG';
    else if (t.type === 'TEMPO') kind = 'TEMPO';
    else if (t.type === 'INTER') kind = 'INTER';
    else kind = 'PROB';
    groups.push({
      kind,
      probabilityPct: probability,
      startMs,
      endMs: Math.min(endMs, validToMs),
      conditions: conv.value.conditions,
      weatherGroupGiven: conv.value.weatherGroupGiven,
      text: t.raw,
    });
  }

  // A group the library dropped completely appears in the text but in none of the groups it returned.
  const missing = tokensMissingFromGroups(
    tokens,
    [tokenise(lib.initialRaw), ...(lib.trends as TAFTrend[]).map((t) => tokenise(t.raw))],
    reportedTokens,
  );
  if (missing.length > 0) warnings.push(droppedGroupWarning(missing));

  // Prevailing periods in time order (stable for equal starts), carrying fields forward.
  const changes = groups.filter((g) => g.kind === 'FM' || g.kind === 'BECMG').sort((a, b) => a.startMs - b.startMs);
  const periods: TafPeriod[] = [{ kind: 'BASE', startMs: validFromMs, ...baseConv.value.conditions, text: lib.initialRaw }];
  for (const g of changes) {
    const prev = periods[periods.length - 1] as TafPeriod;
    // BECMG is an ordinary change at its start time (OD-20, WX-8).
    periods.push({ kind: g.kind as 'FM' | 'BECMG', startMs: g.startMs, ...mergePeriod(prev, g.conditions, g.weatherGroupGiven, g.kind as 'FM' | 'BECMG'), text: g.text });
  }
  const overlays: TafOverlayGroup[] = groups
    .filter((g) => g.kind === 'TEMPO' || g.kind === 'INTER' || g.kind === 'PROB')
    .sort((a, b) => a.startMs - b.startMs)
    .map((g) => ({ ...g.conditions, kind: g.kind as 'TEMPO' | 'INTER' | 'PROB', probabilityPct: g.probabilityPct, startMs: g.startMs, endMs: g.endMs, text: g.text }));

  return {
    kind: 'ok',
    warnings,
    report: {
      station: h.station,
      issuedAtMs,
      validFromMs,
      validToMs,
      amended: h.amended || lib.amendment === true,
      corrected: h.corrected || lib.corrected === true,
      periods,
      overlays,
      raw: text,
    },
  };
}
