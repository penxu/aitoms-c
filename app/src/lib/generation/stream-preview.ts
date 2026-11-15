import type { GenerationEventPayload } from "./types";

type CodeEvent = Extract<GenerationEventPayload, { type: "code" }>;
const PREVIEW_CHARS = 18_000;
const SNAPSHOT_INTERVAL_MS = 200;

interface TextPreviewInput {
  path: string;
  stream: AsyncIterable<string>;
  signal: AbortSignal;
  emit: (event: CodeEvent) => void;
  normalize?: (text: string) => string;
  now?: () => number;
}

function nextWithAbort(iterator: AsyncIterator<string>, signal: AbortSignal): Promise<IteratorResult<string>> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(iterator.next()).then(
      result => { signal.removeEventListener("abort", abort); resolve(result); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

/** Only consumes public textStream output; reasoning/provider internals never enter events. */
export async function consumeTextPreview(input: TextPreviewInput): Promise<string> {
  const now = input.now ?? Date.now;
  const iterator = input.stream[Symbol.asyncIterator]();
  let full = "";
  let lastSnapshot = "";
  let lastEmit = -Infinity;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const clearPending = () => { if (pending) clearTimeout(pending); pending = undefined; };
  const snapshot = (status: "streaming" | "complete") => {
    clearPending();
    if (input.signal.aborted) return;
    input.emit({
      type: "code", path: input.path, content: full.slice(-PREVIEW_CHARS), status,
      totalChars: full.length, totalLines: full ? full.split("\n").length : 0,
    });
    lastSnapshot = full;
    lastEmit = now();
  };

  try {
    while (true) {
      const next = await nextWithAbort(iterator, input.signal);
      input.signal.throwIfAborted();
      if (next.done) { finished = true; break; }
      if (!next.value) continue;
      full += next.value;
      const elapsed = now() - lastEmit;
      if (elapsed >= SNAPSHOT_INTERVAL_MS) snapshot("streaming");
      else if (!pending) pending = setTimeout(() => snapshot("streaming"), SNAPSHOT_INTERVAL_MS - elapsed);
    }
    full = input.normalize ? input.normalize(full) : full;
    snapshot("complete");
    return full;
  } catch (error) {
    // Preserve the last partial output on transport failure; cancellation stops updates immediately.
    if (!input.signal.aborted && full !== lastSnapshot) snapshot("streaming");
    throw error;
  } finally {
    clearPending();
    if (!finished && iterator.return) void Promise.resolve(iterator.return()).catch(() => {});
  }
}
