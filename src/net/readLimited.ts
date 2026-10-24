// Reads a response body with a size cap and a deadline, shared by the traffic and
// weather fetchers. A body over the cap or past the deadline is abandoned.
export class Oversize extends Error {}

export async function readLimited(res: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  // Reading the body stops at the timeout even if the stream never ends.
  const aborted = new Promise<never>((_resolve, reject) => {
    const stop = (): void => reject(signal.reason ?? new Error('aborted'));
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  });
  aborted.catch(() => undefined);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Oversize();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), aborted]);
      } catch (e) {
        await reader.cancel().catch(() => undefined);
        throw e;
      }
      const { done, value } = result;
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Oversize();
      }
      chunks.push(value);
    }
  } else {
    const all = new Uint8Array(await Promise.race([res.arrayBuffer(), aborted]));
    if (all.byteLength > maxBytes) throw new Oversize();
    total = all.byteLength;
    chunks.push(all);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
