// The trust chips: how old each input is and whether it can be relied on. Shape
// carries the state as well as colour: a round dot is fresh, a triangle is stale,
// a cross is failed, an open ring is not entered. Wording follows v1's chips
// (METAR, TAF, VATSIM traffic, recalculated at, next) and v1's stale limits,
// which come from the pack's settings. Pure.
import type { AirportPack } from '../../refdata';
import type { AutoReportState, WeatherKind } from '../controller';
import { ageText, hhmmssZ, hhmmZ, shortAge } from '../format';
import { freshness, nextPlanMs, type FeedState, type ViewData } from './dashboard';

export type ChipShape = 'dot' | 'triangle' | 'cross' | 'ring' | 'refresh';
export type ChipTone = 'ok' | 'warn' | 'bad' | 'unk';

export interface ChipModel {
  readonly id: 'metar' | 'taf' | 'vatsim' | 'plan' | 'draft';
  readonly shape: ChipShape;
  readonly tone: ChipTone;
  /** "METAR", "TAF", "VATSIM", "" for the plan chip, "Pack draft". */
  readonly label: string;
  /** "27m", "2h13", "59s", "19:26 → 19:30"; null where the label says it all. */
  readonly value: string | null;
  /** A word beside the value for the states that are not fresh: Stale, Failed, Not entered. */
  readonly flag: string | null;
  /** What the shape means, in words, for the accessible name. */
  readonly shapeWord: string;
  /** The hover and focus text. */
  readonly tip: string;
}

const SHAPE_WORDS: Readonly<Record<ChipShape, string>> = { dot: 'fresh', triangle: 'stale', cross: 'failed', ring: 'not entered', refresh: 'recalculated' };

function chip(base: Omit<ChipModel, 'shapeWord'>): ChipModel {
  return { ...base, shapeWord: SHAPE_WORDS[base.shape] };
}

function reportChip(
  id: 'metar' | 'taf',
  label: string,
  nowMs: number,
  auto: AutoReportState,
  at: number | null,
  staleMinutes: number,
  detail: (atMs: number, ageMinutes: number) => string,
  pollMinutes: number,
): ChipModel {
  const fetchNote = `Fetched automatically every ${pollMinutes} ${pollMinutes === 1 ? 'minute' : 'minutes'}. Not stored.`;
  const failed = auto.error !== null;
  if (at === null) {
    return chip({
      id,
      label,
      shape: failed ? 'cross' : 'ring',
      tone: failed ? 'bad' : 'unk',
      value: null,
      flag: failed ? 'Failed' : 'Not entered',
      tip: failed ? `${label} could not be fetched: ${auto.error} No weather entered. ${fetchNote}` : `No weather entered. ${fetchNote}`,
    });
  }
  const f = freshness(nowMs, at, staleMinutes);
  const text = detail(at, f.ageMinutes);
  if (failed) {
    return chip({ id, label, shape: 'cross', tone: 'bad', value: shortAge(nowMs - at), flag: 'Failed', tip: `${label} could not be fetched: ${auto.error} The ${label} in use is unchanged: ${text}.` });
  }
  return chip({ id, label, shape: f.stale ? 'triangle' : 'dot', tone: f.stale ? 'warn' : 'ok', value: shortAge(nowMs - at), flag: f.stale ? 'Stale' : null, tip: `${text}.${f.stale ? ` Over the ${staleMinutes} min limit; advice may be out of date.` : ''} ${fetchNote}` });
}

function vatsimChip(feed: FeedState, nowMs: number, pack: AirportPack): ChipModel {
  const s = pack.settings;
  const pollNote = `Fetched automatically every ${s.vatsimPollSeconds} seconds.`;
  if (feed.error !== null) {
    const last = feed.fetchedAtMs === null ? 'There is no earlier traffic data.' : `The last good traffic data is from ${hhmmssZ(feed.fetchedAtMs)}.`;
    return chip({ id: 'vatsim', label: 'VATSIM', shape: 'cross', tone: 'bad', value: feed.fetchedAtMs === null ? null : shortAge(nowMs - feed.fetchedAtMs), flag: 'Failed', tip: `VATSIM traffic could not be fetched: ${feed.error} ${last}` });
  }
  if (feed.fetchedAtMs === null) {
    return chip({ id: 'vatsim', label: 'VATSIM', shape: 'ring', tone: 'unk', value: null, flag: 'Loading', tip: `VATSIM traffic is loading. ${pollNote}` });
  }
  const f = freshness(nowMs, feed.fetchedAtMs, s.vatsimStaleMinutes);
  return chip({
    id: 'vatsim',
    label: 'VATSIM',
    shape: f.stale ? 'triangle' : 'dot',
    tone: f.stale ? 'warn' : 'ok',
    value: shortAge(nowMs - feed.fetchedAtMs),
    flag: f.stale ? 'Stale' : null,
    tip: `VATSIM traffic ${hhmmssZ(feed.fetchedAtMs)}, ${ageText(f.ageMinutes)} old.${f.stale ? ` Over the ${s.vatsimStaleMinutes} min limit.` : ''} ${pollNote}`,
  });
}

/** What the pack itself marks as provisional (its status fields), or an empty list. */
export function provisionalParts(pack: AirportPack): string[] {
  const parts: string[] = [];
  const meta: readonly (readonly [string, { readonly status: string | null; readonly source: string | null }])[] = [
    ['airport', pack.meta.airport],
    ['runways', pack.meta.runways],
    ['modes', pack.meta.modes],
    ['operating plan', pack.meta.operatingPlan],
    ['settings', pack.meta.settings],
  ];
  for (const [name, p] of meta) if (p.status === 'provisional') parts.push(p.source === null ? name : `${name} (${p.source})`);
  const ends = pack.runways.filter((r) => r.status === 'provisional').length;
  if (ends > 0) parts.push(`${ends} runway ${ends === 1 ? 'end' : 'ends'}`);
  const modes = pack.modes.filter((m) => m.status === 'provisional').length;
  if (modes > 0) parts.push(`${modes} ${modes === 1 ? 'mode' : 'modes'}`);
  return parts;
}

/** The chips, in order: METAR, TAF, VATSIM, plan, and "Pack draft" only where the pack says so. */
export function chipModels(view: ViewData, feed: FeedState, nowMs: number, auto: Readonly<Record<WeatherKind, AutoReportState>>): ChipModel[] {
  const { pack } = view;
  const s = pack.settings;
  const chips: ChipModel[] = [
    reportChip('metar', 'METAR', nowMs, auto.metar, view.metar?.observedAtMs ?? null, s.metarStaleMinutes, (at, age) => `METAR ${hhmmZ(at)}, ${ageText(age)} old`, s.weatherPollMinutes),
    reportChip('taf', 'TAF', nowMs, auto.taf, view.taf?.issuedAtMs ?? null, s.tafStaleMinutes, (at, age) => `TAF issued ${hhmmZ(at)}, valid to ${hhmmZ(view.taf?.validToMs ?? at)}, ${ageText(age)} old`, s.weatherPollMinutes),
    vatsimChip(feed, nowMs, pack),
  ];
  const hm = (ms: number): string => hhmmZ(ms).slice(0, 5);
  chips.push(
    chip({
      id: 'plan',
      label: '',
      shape: 'refresh',
      tone: 'ok',
      value: `${hm(view.calcNowMs)} → ${hm(nextPlanMs(view.calcNowMs))}`,
      flag: null,
      tip: `Plan recalculated at ${hhmmZ(view.calcNowMs)}. Next recalculation ${hhmmZ(nextPlanMs(view.calcNowMs))}.`,
    }),
  );
  const draft = provisionalParts(pack);
  if (draft.length > 0) {
    chips.push(chip({ id: 'draft', label: 'Pack draft', shape: 'triangle', tone: 'warn', value: null, flag: null, tip: `The ${pack.airport.icao} pack has provisional data: ${draft.join(', ')}.` }));
  }
  return chips;
}
