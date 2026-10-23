// Our own reading of the groups in a report, used only to CHECK what the
// decoding library returned. The library silently drops groups it does not
// know (a "///015" cloud group, a glued "BECMG2312/2314"); this scanner has its
// own list of what a report may contain, so anything outside that list, or
// anything the library did not return, becomes a warning. No library imports.
import type { DecodeWarning } from '../types';

export const MAX_LISTED_WARNING_TOKENS = 6;
/** Longest token text shown in any message, and the longest token allowed outside remarks. */
export const MAX_TOKEN_CHARS = 40;

/** Token text for a message: cut at 40 characters with an ellipsis, so pasted junk is never echoed whole. */
export function clip(token: string): string {
  return token.length > MAX_TOKEN_CHARS ? `${token.slice(0, MAX_TOKEN_CHARS)}...` : token;
}

const DESC = '(?:MI|BC|PR|DR|BL|SH|TS|FZ)';
const PHEN = '(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|FG|BR|HZ|VA|DU|SA|FU|PY|SQ|PO|DS|SS|FC)';

const WIND = /^(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?(?:KT|MPS|KMH)$/;
const WIND_NOT_REPORTED = /^(?:\/{5}|\/{3}\d{2}|\d{3}\/{2})(?:G\/{2})?(?:KT|MPS|KMH)$/;
const WIND_RANGE = /^\d{3}V\d{3}$/;
const VIS_METRES = /^\d{4}(?:NDV)?$/;
const VIS_DIRECTIONAL = /^\d{4}(?:N|NE|E|SE|S|SW|W|NW)$/;
const VIS_SM = /^(?:[PM]?\d{1,2}|[PM]?\d{1,2}\/\d{1,2})SM$/;
const CLOUD = /^(?:FEW|SCT|BKN|OVC)\d{3}(?:CB|TCU)?(?:\/{3})?$/;
const CLEAR = /^(?:SKC|CLR|NSC|NCD)$/;
// Cloud groups with an unknown amount or height, such as ///015 or //////CB.
const CLOUD_UNKNOWN = /^(?:\/{3}\d{3}(?:\/{3}|CB|TCU)?|\/{3}(?:CB|TCU)|(?:FEW|SCT|BKN|OVC)\/{3}(?:CB|TCU)?|\/{6}(?:CB|TCU))$/;
const VERTICAL_VIS = /^VV(?:\d{3}|\/{3})$/;
const WEATHER = new RegExp(`^(?:\\+|-|VC)?(?=[A-Z])${DESC}*${PHEN}*$`);
const RECENT_WEATHER = new RegExp(`^RE(?:\\+|-)?(?=[A-Z])(?:${DESC}|${PHEN})+$`);
const TEMPERATURE = /^(?:M?\d{2}|\/\/)\/(?:M?\d{2}|\/\/)?$/;
const PRESSURE = /^(?:Q|A)(?:\d{4}|\/{4})$/;
const RUNWAY_GROUP = /^R\d{2}[LCR]?\/\S*$/;
const NO_DATA = /^(?:\/+|RE\/\/)$/;
const SPECIAL_MARKERS = new Set(['AUTO', 'COR', 'CCA', 'CCB', 'CCC', 'NIL', 'NSW', 'CAVOK', 'SNOCLO', 'NOSIG', 'WS', 'ALL', 'RWY', 'LLWS']);
const BODY_END = new Set(['RMK', 'TEMPO', 'BECMG', 'NOSIG']);

// TAF only.
const TAF_VALIDITY = /^\d{4}\/\d{4}$/;
const TAF_FM = /^FM\d{6}$/;
const TAF_TEMPERATURE = /^T[XN]M?\d{2}\/\d{4,6}Z?$/;
const TAF_QNH = /^QNH\d{4}INS$/;
const TAF_TURB_ICE = /^[56]\d{5}$/;
const TAF_WIND_SHEAR = /^WS\d{3}\/\d{5}(?:G\d{2,3})?(?:KT|MPS|KMH)$/;
const TAF_CHANGE_KEYWORDS = new Set(['BECMG', 'TEMPO', 'INTER', 'PROB30', 'PROB40', 'WND']);

export const TAF_GROUP_START = /^(?:FM\d{6}|BECMG|TEMPO|INTER|PROB\d{2})$/;

export function tokenise(text: string): string[] {
  return text.split(' ').filter((t) => t !== '');
}

export interface GroupCounts {
  /** Wind groups with a speed (including VRB). */
  readonly wind: number;
  /** Those wind groups as written. */
  readonly windTokens: readonly string[];
  /** Visibility groups (metres, statute miles). */
  readonly visibility: number;
  /** FEW/SCT/BKN/OVC groups with a height. */
  readonly clouds: number;
  /** Present-weather groups, including NSW. */
  readonly weather: number;
}

export interface GroupScan {
  readonly counts: GroupCounts;
  /** Tokens that match nothing we know. */
  readonly unknown: readonly string[];
  /** Cloud groups with an unknown amount or height, which the library drops. */
  readonly unknownClouds: readonly string[];
  /** Wind group present but the speed or direction is not reported (/////KT). */
  readonly windNotReported: boolean;
  /** Number of 1/16SM visibility groups (the library cannot read them; we repair them to 100 m). */
  readonly sixteenths: number;
  /** A METAR trend forecast (TEMPO/BECMG) followed the body. */
  readonly trendFollows: boolean;
}

export interface ScanOptions {
  /** TAF group: allow TAF keywords, validity periods and similar. */
  readonly taf: boolean;
}

/**
 * Scans the tokens of one group (a METAR body without its header, or one TAF
 * group). Stops at RMK (remarks are free text) and, for a METAR, at the first
 * trend keyword.
 */
export function scanGroup(tokens: readonly string[], opts: ScanOptions): GroupScan {
  let wind = 0;
  const windTokens: string[] = [];
  let visibility = 0;
  let clouds = 0;
  let weather = 0;
  const unknown: string[] = [];
  const unknownAt: number[] = [];
  const unknownClouds: string[] = [];
  let windNotReported = false;
  let sixteenths = 0;
  let trendFollows = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string;
    if (t === 'RMK') break;
    if (!opts.taf && BODY_END.has(t)) {
      if (t === 'TEMPO' || t === 'BECMG') trendFollows = true;
      break;
    }
    if (t === 'WND' && WIND_RANGE.test(tokens[i + 1] ?? '')) {
      // US military "WND 110V190" direction range: the library does not return it.
      unknown.push(`WND ${tokens[i + 1] as string}`);
      unknownAt.push(i);
      i++;
    } else if (WIND.test(t)) {
      wind++;
      windTokens.push(t);
    } else if (WIND_NOT_REPORTED.test(t)) {
      windNotReported = true;
    } else if (WIND_RANGE.test(t) || VIS_DIRECTIONAL.test(t)) {
      // Part of the wind or visibility group above.
    } else if (/^[PM]?1\/16SM$/.test(t)) {
      sixteenths++;
    } else if (VIS_SM.test(t)) {
      visibility++;
    } else if (VIS_METRES.test(t)) {
      visibility++;
    } else if (/^\d$/.test(t) && VIS_SM.test(tokens[i + 1] ?? '')) {
      // "1 1/2SM": the whole number comes first; the fraction group is counted next.
    } else if (CLOUD.test(t)) {
      clouds++;
    } else if (CLEAR.test(t) || VERTICAL_VIS.test(t)) {
      // Nothing to count.
    } else if (CLOUD_UNKNOWN.test(t)) {
      unknownClouds.push(t);
    } else if (t === 'NSW' || (WEATHER.test(t) && t !== '+' && t !== '-')) {
      weather++;
    } else if (RECENT_WEATHER.test(t) || TEMPERATURE.test(t) || PRESSURE.test(t) || RUNWAY_GROUP.test(t) || NO_DATA.test(t)) {
      // Known, handled elsewhere or not used.
    } else if (SPECIAL_MARKERS.has(t) || /^\d{8}$/.test(t)) {
      // Known markers; an 8-digit group is a runway state.
    } else if (opts.taf && (TAF_VALIDITY.test(t) || TAF_FM.test(t) || TAF_TEMPERATURE.test(t) || TAF_QNH.test(t) || TAF_TURB_ICE.test(t) || TAF_WIND_SHEAR.test(t) || TAF_CHANGE_KEYWORDS.has(t) || t === 'TAF' || t === 'AMD' || t === 'CNL')) {
      // Known TAF markers.
    } else {
      unknown.push(t);
      unknownAt.push(i);
    }
  }
  // Plain-language remark text that follows the report without an RMK marker
  // (national practice: "AUTOMATED SENSOR ...", "LAST NO AMDS AFT ...") is not a
  // dropped group. A run of three or more unknown tokens, or two or more
  // all-letter words, side by side is read as remark text. A lone odd token is
  // still reported, because that is what a typo in a real group looks like.
  const isRemark = new Set<number>();
  for (let a = 0; a < unknownAt.length; ) {
    let b = a;
    while (b + 1 < unknownAt.length && (unknownAt[b + 1] as number) === (unknownAt[b] as number) + 1) b++;
    const run = unknownAt.slice(a, b + 1);
    const allWords = run.every((idx) => /^[A-Z]{2,}$/.test(tokens[idx] as string));
    if (run.length >= 3 || (run.length >= 2 && allWords)) for (const idx of run) isRemark.add(idx);
    a = b + 1;
  }
  const kept = unknown.filter((_, k) => !isRemark.has(unknownAt[k] as number));
  return { counts: { wind, windTokens, visibility, clouds, weather }, unknown: kept, unknownClouds, windNotReported, sixteenths, trendFollows };
}

export interface LibraryCounts {
  readonly hasWind: boolean;
  readonly hasVisibility: boolean;
  readonly clouds: number;
  readonly weather: number;
}

function listTokens(tokens: readonly string[]): string {
  const shown = tokens.slice(0, MAX_LISTED_WARNING_TOKENS).map(clip).join(', ');
  return tokens.length > MAX_LISTED_WARNING_TOKENS ? `${shown} and ${tokens.length - MAX_LISTED_WARNING_TOKENS} more` : shown;
}

/**
 * Warnings for one group: tokens we do not know, unknown cloud groups the
 * library drops, and anything we can see in the text that the library did not
 * return (a wind, visibility, cloud or weather group missing from its result).
 */
export function groupWarnings(scan: GroupScan, lib: LibraryCounts, where: string): DecodeWarning[] {
  const out: DecodeWarning[] = [];
  if (scan.unknown.length > 0) {
    out.push({ code: 'group-not-understood', message: `${where}: not understood and ignored: ${listTokens(scan.unknown)}.` });
  }
  if (scan.unknownClouds.length > 0) {
    out.push({ code: 'cloud-group-dropped', message: `${where}: cloud group with unknown amount or height ignored: ${listTokens(scan.unknownClouds)}.` });
  }
  if (scan.windNotReported) {
    out.push({ code: 'wind-not-reported', message: `${where}: the wind is not reported.` });
  }
  const dropped: string[] = [];
  if (scan.counts.wind > 0 && !lib.hasWind) dropped.push('wind');
  if (scan.counts.visibility > 0 && !lib.hasVisibility) dropped.push('visibility');
  if (scan.counts.clouds > lib.clouds) dropped.push('cloud');
  if (scan.counts.weather > lib.weather) dropped.push('weather');
  if (dropped.length > 0) {
    out.push({ code: 'decoder-dropped-group', message: `${where}: the decoder did not return the ${dropped.join(', ')} group${dropped.length > 1 ? 's that appear' : ' that appears'} in the text.` });
  }
  return out;
}

/**
 * Tokens of the whole TAF text that appear in none of the groups the library
 * returned, other than remark text. A group the library dropped completely
 * (for example a glued "BECMG2312/2314 5000") shows up here.
 */
export function tokensMissingFromGroups(messageTokens: readonly string[], groups: readonly (readonly string[])[], alreadyReported: ReadonlySet<string>): string[] {
  const available = new Map<string, number>();
  for (const g of groups) for (const t of g) available.set(t, (available.get(t) ?? 0) + 1);
  const missing: string[] = [];
  let inRemark = false;
  for (const t of messageTokens) {
    if (TAF_GROUP_START.test(t)) inRemark = false;
    if (t === 'RMK') inRemark = true;
    const left = available.get(t) ?? 0;
    if (left > 0) {
      available.set(t, left - 1);
    } else if (!inRemark && !alreadyReported.has(t) && t !== 'TAF' && t !== 'RMK') {
      missing.push(t);
    }
  }
  return missing;
}

/** A token longer than the maximum, outside remark text (a TAF remark ends at the next change group). Null if none. */
export function overlongToken(tokens: readonly string[]): string | null {
  let inRemark = false;
  for (const t of tokens) {
    if (TAF_GROUP_START.test(t)) inRemark = false;
    if (t === 'RMK') inRemark = true;
    if (!inRemark && t.length > MAX_TOKEN_CHARS) return t;
  }
  return null;
}

interface LibWind {
  readonly speed: number;
  readonly gust?: number;
  readonly degrees?: number;
  readonly direction: string;
  readonly unit: string;
}

/**
 * The library's wind regex is not anchored, so junk containing digits (a
 * 4000-digit token, "27015KTX") can be read as a wind. Every wind the library
 * returns must match, number for number, a wind group of ours that is exactly
 * a valid group. Returns a message naming the problem, or null when it agrees.
 */
export function windDisagreement(scan: GroupScan, wind: LibWind | undefined): string | null {
  if (wind === undefined) return null;
  const tokens = scan.counts.windTokens;
  if (tokens.length === 0) {
    const odd = scan.unknown.find((t) => /\d{5}/.test(t) || /(KT|MPS|KMH)/.test(t));
    return odd === undefined ? 'a wind was returned that is not in a valid wind group' : `"${clip(odd)}" is not a valid wind group`;
  }
  const unit = wind.unit === 'KM/H' ? 'KMH' : wind.unit;
  const ok = tokens.some((t) => {
    const m = /^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/.exec(t);
    if (m === null) return false;
    const dirOk = m[1] === 'VRB' ? wind.direction === 'VRB' : wind.degrees === Number(m[1]);
    return dirOk && wind.speed === Number(m[2]) && (m[3] === undefined ? wind.gust === undefined : wind.gust === Number(m[3])) && unit === m[4];
  });
  return ok ? null : `the wind the decoder returned does not match the wind group "${clip(tokens[0] as string)}"`;
}

export function droppedGroupWarning(tokens: readonly string[]): DecodeWarning {
  return { code: 'decoder-dropped-group', message: `Dropped by the decoder and not used: ${listTokens(tokens)}.` };
}

/** Recent-weather tokens (RERA, RETS, REFZRA...) in a METAR body, before remarks and trends. */
export function recentWeatherTokens(tokens: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (t === 'RMK' || t === 'TEMPO' || t === 'BECMG' || t === 'NOSIG') break;
    if (RECENT_WEATHER.test(t)) out.push(t);
  }
  return out;
}

/** Splits a present-weather token such as -SHRA or VCTS into intensity, descriptor and phenomena; null if it is not one. */
export function splitWeatherToken(token: string): { intensity: '-' | '+' | 'VC' | null; descriptor: string | null; phenomena: string[] } | null {
  const m = new RegExp(`^(\\+|-|VC)?((?:${DESC})*)((?:${PHEN})*)$`).exec(token);
  if (m === null || (m[2] === '' && m[3] === '')) return null;
  const pairs = (s: string): string[] => s.match(/../g) ?? [];
  const descriptors = pairs(m[2] ?? '');
  return {
    intensity: (m[1] as '-' | '+' | 'VC' | undefined) ?? null,
    descriptor: descriptors[0] ?? null,
    phenomena: [...descriptors.slice(1), ...pairs(m[3] ?? '')],
  };
}
