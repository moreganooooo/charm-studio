import type { IRDoc } from "./types";

export interface SavedStudioState {
  ir: IRDoc;
  paletteId: string;
  templateId: string;
}

const STORAGE_KEY = "charmstudio:v2:draft";

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export async function encodeShareHash(state: SavedStudioState): Promise<string> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream !== "undefined") {
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(jsonBytes);
    writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return "gz:" + bytesToBase64Url(compressed);
  }
  return "b64:" + bytesToBase64Url(jsonBytes);
}

export async function decodeShareHash(hash: string): Promise<SavedStudioState | null> {
  try {
    const clean = hash.replace(/^#/, "");
    const prefix = "s=";
    if (!clean.startsWith(prefix)) return null;
    const payload = decodeURIComponent(clean.slice(prefix.length));

    if (payload.startsWith("gz:") && typeof DecompressionStream !== "undefined") {
      const bytes = base64UrlToBytes(payload.slice(3));
      const ds = new DecompressionStream("gzip");
      const writer = ds.writable.getWriter();
      writer.write(bytes as unknown as BufferSource);
      writer.close();
      const text = await new Response(ds.readable).text();
      return JSON.parse(text) as SavedStudioState;
    }

    if (payload.startsWith("b64:")) {
      const bytes = base64UrlToBytes(payload.slice(4));
      return JSON.parse(new TextDecoder().decode(bytes)) as SavedStudioState;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDraft(state: SavedStudioState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function loadDraft(): SavedStudioState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedStudioState) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
