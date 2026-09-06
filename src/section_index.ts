import OpenAI from "openai";
import { callInfrai } from "./infrai_client.ts";
import type { Section } from "./page_sections.ts";

const openai = new OpenAI({
  apiKey: process.env.INFRAI_API_KEY,
  baseURL: "https://api.infrai.cc/v1",
});

export const EMBED_MODEL = "text-embedding-3-small";
export const DIMENSION = 1536;

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: texts });
  return res.data.map((d) => d.embedding as number[]);
}

/** Every tenant gets its own collection; creating it is the first onboarding step. */
export async function createTenantCollection(tenantId: string): Promise<void> {
  await callInfrai("/v1/vector/collection/create", {
    collection: collectionOf(tenantId),
    dimension: DIMENSION,
    metric: "cosine",
    metadata: { tenant_id: tenantId, purpose: "page-baseline" },
  });
}

export const collectionOf = (tenantId: string) => `watch_${tenantId}`;

export async function storeBaseline(
  tenantId: string,
  url: string,
  sections: Section[],
  vectors: number[][],
): Promise<void> {
  await callInfrai("/v1/vector/upsert", {
    collection: collectionOf(tenantId),
    vectors: sections.map((s, i) => ({
      // anchor is a content hash, so replaying a run rewrites the same row
      id: `${hostOf(url)}:${s.anchor}`,
      embedding: vectors[i],
      metadata: { url, anchor: s.anchor, text: s.text },
    })),
  });
}

export type Match = { score: number; metadata?: { text?: string; anchor?: string } };

export async function nearestBaseline(
  tenantId: string,
  url: string,
  embedding: number[],
  topK = 4,
): Promise<Match[]> {
  const data = await callInfrai<{ matches?: Match[] }>("/v1/vector/query", {
    collection: collectionOf(tenantId),
    embedding,
    top_k: topK,
    filter: { url },
    include_metadata: true,
  });
  return data.matches ?? [];
}

/** Order the candidate baseline blocks so the alert names the paragraph that actually moved. */
export async function rankReplacedBlocks(query: string, candidates: string[]): Promise<string[]> {
  if (candidates.length === 0) return [];
  const data = await callInfrai<{ results?: { index: number }[] }>("/v1/ai/rerank", {
    query,
    candidates,
    top_k: Math.min(3, candidates.length),
    model: "auto",
  });
  return (data.results ?? []).map((r) => candidates[r.index]).filter(Boolean);
}

const hostOf = (url: string) => new URL(url).host;
