// The server-side NAIPS fetch (issue 159): SOAP request, block extraction, the 30-minute floor, and
// the rule that credentials never leave the server. A fake fetch stands in for NAIPS; nothing here
// touches the network, a .env file or a real credential (the values below are invented).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATIS_MIN_INTERVAL_MINUTES, ATIS_MIN_INTERVAL_MS, NAIPS_URL, buildEnvelope, contentOf, createAtisMiddleware, createAtisService, extractAtisBlock, type AtisOutcome } from '../../scripts/atisMiddleware';

const USER = 'dummy.user&co';
const PASS = 'p<a>"s\'s&word';
const MIN = 60_000;

const BLOCK = 'ATIS ZZZA B 291200\n  RWY: 27 FOR ARR. RWY 27 FOR DEP.\n  WIND: 270/10';
/** The server trims each line. */
const EXPECTED = BLOCK.split('\n').map((l) => l.trim()).join('\n');
const briefing = (extra = ''): string => `Preamble line\r\n${BLOCK.replace(/\n/g, '\r\n')}\r\n\r\nNOTAM section\r\n${extra}`;
const soap = (content: string, status = 'SUCCESS', cdata = false): string =>
  `<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="x"><SOAP-ENV:Body><ns1:loc-brief-rsp status="${status}"><ns1:content>${
    cdata ? `<![CDATA[${content}]]>` : content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }</ns1:content></ns1:loc-brief-rsp></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function rig(opts: { answer?: () => Response | Promise<Response>; creds?: { username?: string; password?: string } } = {}) {
  const clock = { now: 1_000_000 };
  const calls: Call[] = [];
  const service = createAtisService({
    getCredentials: () => opts.creds ?? { username: USER, password: PASS },
    fetch: async (url, init) => {
      calls.push({ url, init: init ?? {} });
      return opts.answer === undefined ? new Response(soap(briefing())) : opts.answer();
    },
    now: () => clock.now,
    isKnownAirport: (i) => i === 'ZZZA' || i === 'ZZZB',
  });
  return { clock, calls, service };
}

const ask = (r: ReturnType<typeof rig>, icao = 'ZZZA'): Promise<AtisOutcome> => r.service('GET', icao);

describe('the SOAP request', () => {
  it('goes to the NAIPS address with the headers, the upper-cased and escaped username, the escaped password and the ICAO from the URL', async () => {
    const r = rig();
    const out = await ask(r);
    expect(out.status).toBe(200);
    expect(r.calls).toHaveLength(1);
    const call = r.calls[0]!;
    expect(call.url).toBe(NAIPS_URL);
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toEqual({ 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' });
    const body = String(call.init.body);
    expect(body).toContain('requestor="DUMMY.USER&amp;CO"');
    expect(body).toContain('password="p&lt;a&gt;&quot;s&apos;s&amp;word"');
    expect(body).toContain('<ns1:loc>ZZZA</ns1:loc>');
    expect(body).toContain('source="atis"');
    expect(body).not.toContain('dummy.user');
  });
  it('buildEnvelope upper-cases only the username (NAIPS rejects lower case), never the password', () => {
    const body = buildEnvelope('ZZZA', { username: 'abc', password: 'MiXed' });
    expect(body).toContain('requestor="ABC"');
    expect(body).toContain('password="MiXed"');
  });
});

describe('the answer', () => {
  it('returns only the ATIS block and the time it was fetched', async () => {
    const r = rig();
    expect(await ask(r)).toEqual({ status: 200, body: { atis: EXPECTED, fetchedAt: r.clock.now } });
  });
  it('reads CDATA content too', () => {
    expect(extractAtisBlock(contentOf(soap(briefing(), 'SUCCESS', true)) ?? '', 'ZZZA')).toBe(EXPECTED);
  });
  it('stops the block at the first blank line or non-indented line', () => {
    expect(extractAtisBlock('x\nATIS ZZZA A 010101\n  one\n  two\n\n  three', 'ZZZA')).toBe('ATIS ZZZA A 010101\none\ntwo');
    expect(extractAtisBlock('ATIS ZZZA A 010101\n  one\nOTHER\n  two', 'ZZZA')).toBe('ATIS ZZZA A 010101\none');
  });
  it('no ATIS block for that airport, or none at all, is a 503', async () => {
    expect((await ask(rig({ answer: () => new Response(soap('ATIS ZZZB A 010101\n  RWY: 1')) }))).status).toBe(503);
    expect((await ask(rig({ answer: () => new Response(soap('nothing here')) }))).status).toBe(503);
    expect((await ask(rig({ answer: () => new Response('<x/>') }))).status).toBe(503);
  });
  it('a status other than SUCCESS is a 503, even with a block present', async () => {
    const r = rig({ answer: () => new Response(soap(briefing(), 'FAILURE')) });
    expect((await ask(r)).status).toBe(503);
  });
  it('an HTTP error, a thrown error and an oversize answer are each a 503', async () => {
    expect((await ask(rig({ answer: () => new Response('no', { status: 500 }) }))).status).toBe(503);
    expect((await ask(rig({ answer: () => Promise.reject(new Error(`boom ${USER} ${PASS}`)) }))).status).toBe(503);
    expect((await ask(rig({ answer: () => new Response('x'.repeat(600 * 1024)) }))).status).toBe(503);
  });
});

describe('the request is checked before anything is sent', () => {
  it.each(['', 'zzza', 'ZZZ', 'ZZZAA', 'ZZ1A', 'ZZZ/', '../..', 'ZZZ%41', 'ZZZ A'])('rejects the code %j with 400 and makes no call', async (icao) => {
    const r = rig();
    expect((await ask(r, icao)).status).toBe(400);
    expect(r.calls).toHaveLength(0);
  });
  it('only GET is answered', async () => {
    const r = rig();
    expect((await r.service('POST', 'ZZZA')).status).toBe(405);
    expect(r.calls).toHaveLength(0);
  });
  it('missing or empty credentials is a 503 with no call and no credential text', async () => {
    for (const creds of [{}, { username: USER }, { password: PASS }, { username: '', password: PASS }, { username: USER, password: '' }]) {
      const r = rig({ creds });
      const out = await ask(r);
      expect(out.status).toBe(503);
      expect(JSON.stringify(out)).not.toContain(USER);
      expect(r.calls).toHaveLength(0);
    }
  });
});

describe('the 30-minute floor: NAIPS is never asked for the same airport more often', () => {
  it('is 30 minutes (the owner\'s number; change it only on the owner\'s say-so)', () => {
    expect(ATIS_MIN_INTERVAL_MINUTES).toBe(30);
    expect(ATIS_MIN_INTERVAL_MS).toBe(30 * MIN);
  });
  it('serves the cache until a full 30 minutes have passed, then asks again once', async () => {
    const r = rig();
    await ask(r);
    for (const step of [1, 10, 29 * MIN, 29 * MIN + 59_000]) {
      r.clock.now = 1_000_000 + (step < MIN ? step * 1000 : step);
      await ask(r);
    }
    expect(r.calls).toHaveLength(1);
    r.clock.now = 1_000_000 + 30 * MIN;
    const again = await ask(r);
    expect(r.calls).toHaveLength(2);
    expect(again.status).toBe(200);
    r.clock.now += 5 * MIN;
    await ask(r);
    expect(r.calls).toHaveLength(2);
  });
  it('a hundred quick asks make one call', async () => {
    const r = rig();
    await Promise.all(Array.from({ length: 100 }, () => ask(r)));
    expect(r.calls).toHaveLength(1);
  });
  it('a failure is cached for the same 30 minutes: an error does not make the client retry NAIPS sooner', async () => {
    const r = rig({ answer: () => new Response('no', { status: 500 }) });
    expect((await ask(r)).status).toBe(503);
    r.clock.now += 29 * MIN;
    expect((await ask(r)).status).toBe(503);
    expect(r.calls).toHaveLength(1);
    r.clock.now += MIN;
    await ask(r);
    expect(r.calls).toHaveLength(2);
  });
  it('each airport has its own floor', async () => {
    const r = rig({ answer: () => new Response(soap(`${BLOCK}\n\nATIS ZZZB C 291200\n  RWY: 1`)) });
    await ask(r, 'ZZZA');
    await ask(r, 'ZZZB');
    expect(r.calls).toHaveLength(2);
  });
});

describe('credentials never leave the server', () => {
  afterEach(() => vi.restoreAllMocks());
  it('the user name and password appear in no response and no log, success or failure', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug')];
    const outcomes: AtisOutcome[] = [];
    outcomes.push(await ask(rig()));
    outcomes.push(await ask(rig({ answer: () => Promise.reject(new Error(`echo ${String(USER)} ${PASS}`)) })));
    outcomes.push(await ask(rig({ answer: () => new Response(`${USER} ${PASS}`, { status: 401 }) })));
    outcomes.push(await ask(rig({ creds: {} })));
    outcomes.push(await ask(rig({ answer: () => new Response(soap(briefing(), 'FAILURE')) })));
    for (const o of outcomes) {
      const text = JSON.stringify(o).toUpperCase();
      expect(text).not.toContain(USER.toUpperCase());
      expect(text).not.toContain(PASS.toUpperCase());
      expect(text).not.toContain('PASSWORD');
      expect(text).not.toContain('REQUESTOR');
    }
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  });
});

describe('over HTTP (the real handler on a throwaway local server)', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((done) => (server === undefined ? done() : server.close(() => done()))));
  it('answers JSON for a good code, 400 for a bad one, with no-store and no credential text', async () => {
    const calls: string[] = [];
    const handler = createAtisMiddleware({
      getCredentials: () => ({ username: USER, password: PASS }),
      fetch: async (_url, init) => {
        calls.push(String(init?.body));
        return new Response(soap(briefing()));
      },
      now: () => 42,
      isKnownAirport: (i) => i === 'ZZZA',
    });
    server = createServer((req, res) => handler(Object.assign(req, { url: (req.url ?? '').replace('/api/atis', '') }), res));
    await new Promise<void>((ok) => server!.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/atis`;
    const good = await fetch(`${base}/ZZZA`);
    expect(good.status).toBe(200);
    expect(good.headers.get('cache-control')).toBe('no-store');
    expect(await good.json()).toEqual({ atis: EXPECTED, fetchedAt: 42 });
    const bad = await fetch(`${base}/zzza`);
    expect(bad.status).toBe(400);
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(await bad.json())).not.toContain(USER);
  });
});
