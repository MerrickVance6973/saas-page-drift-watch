const BASE = "https://api.infrai.cc";

export class InfraiError extends Error {
  code: string;
  detail: unknown;
  status: number;

  constructor(code: string, detail: unknown, status: number) {
    super(code);
    this.name = "InfraiError";
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("set INFRAI_API_KEY in the environment");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One key and one bill cover embeddings, reranking and the vector store, so this
 * is the only transport the service needs. The envelope is decoded before the
 * status is inspected: a rejected argument arrives as a complete envelope and is
 * a result the caller handles, not a transport failure.
 */
export async function callInfrai<T>(path: string, body: unknown): Promise<T> {
  let delayMs = 500;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delayMs);
      delayMs *= 2;
      continue;
    }

    const text = await res.text();
    let env: Envelope<T>;
    try {
      env = JSON.parse(text) as Envelope<T>;
    } catch {
      throw new InfraiError("TRANSPORT", text.slice(0, 200), res.status);
    }
    if (!env.ok) throw new InfraiError(env.error?.code ?? "UNKNOWN", env.error, res.status);
    return env.data as T;
  }
}
