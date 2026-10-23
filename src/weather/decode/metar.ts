// METAR adapter: pasted text in, our DecodedMetar (or a plain error) out.
import { parseMetar } from 'metar-taf-parser';
import type { DecodeContext, DecodeResult, DecodeWarning, DecodedMetar, DecodedWeatherCondition } from '../types';
import { convertConditions, qnhToHpa } from './convert';
import { parseMetarHeader, splitMixedFractions } from './header';
import { cleanReportText } from './input';
import { groupWarnings, recentWeatherTokens, scanGroup, splitWeatherToken, tokenise } from './tokens';
import { resolveRecent } from './time';

/** An observation this far ahead of the clock is reported (clock skew or a wrong day), though it is still used. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

function recentWeather(bodyTokens: readonly string[]): DecodedWeatherCondition[] {
  return recentWeatherTokens(bodyTokens).map((t) => {
    const parts = splitWeatherToken(t.slice(2));
    return parts === null
      ? { intensity: null, descriptor: null, phenomena: [], codes: [] }
      : { ...parts, codes: parts.descriptor === null ? parts.phenomena : [parts.descriptor, ...parts.phenomena] };
  });
}

export function decodeMetar(raw: string, ctx: DecodeContext): DecodeResult<DecodedMetar> {
  const cleaned = cleanReportText(raw, 'The METAR');
  if (!cleaned.ok) return { kind: 'error', message: cleaned.message };
  const text = splitMixedFractions(cleaned.text);
  const tokens = tokenise(text);

  const parsed = parseMetarHeader(tokens);
  if (!parsed.ok) return { kind: 'error', message: parsed.message };
  const h = parsed.header;

  const expected = ctx.pack.airport.weatherStation;
  if (h.station !== expected) {
    return { kind: 'error', message: `This METAR is for station ${h.station}, but this airport uses station ${expected}. It was not used.` };
  }
  const observedAtMs = resolveRecent(h.day, h.hour, h.minute, ctx.nowMs);
  if (observedAtMs === null) {
    return { kind: 'error', message: `The observation time ${String(h.day).padStart(2, '0')}${String(h.hour).padStart(2, '0')}${String(h.minute).padStart(2, '0')}Z does not match any real date.` };
  }

  const bodyTokens = tokens.slice(h.bodyStart);
  if (bodyTokens.includes('NIL') && bodyTokens.filter((t) => t !== 'AUTO' && t !== 'COR' && t !== 'NIL').length === 0) {
    return { kind: 'none', reason: 'nil', station: h.station, warnings: [] };
  }

  const scan = scanGroup(bodyTokens, { taf: false });
  let lib;
  try {
    lib = parseMetar(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown error';
    const where = scan.unknown.length > 0 ? ` Groups not recognised: ${scan.unknown.slice(0, 6).join(', ')}.` : ' No single group could be pointed to; check the report is a complete METAR.';
    return { kind: 'error', message: `The METAR could not be read (the decoder said "${reason}").${where} The previous report, if any, stays in use.` };
  }

  const converted = convertConditions(lib, 'METAR');
  if (!converted.ok) return { kind: 'error', message: `The METAR could not be read: ${converted.message}` };
  const { conditions } = converted.value;

  const warnings: DecodeWarning[] = groupWarnings(
    scan,
    { hasWind: lib.wind !== undefined, hasVisibility: lib.visibility !== undefined, clouds: lib.clouds.length, weather: lib.weatherConditions.length },
    'METAR',
  );
  if (scan.trendFollows) {
    warnings.push({ code: 'metar-trend-ignored', message: 'METAR: the trend forecast (TEMPO or BECMG) at the end of the report is not used; the TAF is the forecast.' });
  }
  if (observedAtMs - ctx.nowMs > FUTURE_TOLERANCE_MS) {
    const minutes = Math.round((observedAtMs - ctx.nowMs) / 60_000);
    warnings.push({ code: 'time-in-future', message: `METAR: the observation time is ${minutes} minutes ahead of the clock. Check the clock and the report day.` });
  }

  return {
    kind: 'ok',
    warnings,
    report: {
      ...conditions,
      reportType: h.reportType,
      station: h.station,
      observedAtMs,
      auto: lib.auto === true,
      corrected: h.corrected || lib.corrected === true,
      recentWeather: recentWeather(bodyTokens),
      temperatureC: lib.temperature ?? null,
      dewPointC: lib.dewPoint ?? null,
      qnhHpa: qnhToHpa(lib.altimeter),
      raw: text,
    },
  };
}
