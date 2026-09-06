import { createHash } from "node:crypto";

export type Section = { anchor: string; text: string };

const BLOCK = /<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/** Split a fetched marketing/pricing page into the blocks a founder actually cares about. */
export function extractSections(html: string): Section[] {
  const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
  const out: Section[] = [];
  for (const m of body.matchAll(BLOCK)) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 24) continue;
    out.push({ anchor: createHash("sha1").update(text).digest("hex").slice(0, 12), text });
  }
  return out;
}

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { method: "GET", headers: { accept: "text/html" } });
  return await res.text();
}
