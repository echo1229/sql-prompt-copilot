import { info } from "@tauri-apps/plugin-log";

function log(msg: string) { info(`[correctionKB] ${msg}`).catch(() => {}); }

export interface Correction {
  id: string;
  query: string;
  error: string;
  correction: string;
  date: string;
}

const STORAGE_KEY = "sql-copilot-corrections";

function loadCorrections(): Correction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCorrections(corrections: Correction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections));
}

export function addCorrection(query: string, error: string, correction: string): Correction {
  const corrections = loadCorrections();
  const entry: Correction = {
    id: Date.now().toString(36),
    query,
    error,
    correction,
    date: new Date().toISOString(),
  };
  corrections.push(entry);
  saveCorrections(corrections);
  log(`Added correction: ${error} -> ${correction}`);
  return entry;
}

export function deleteCorrection(id: string) {
  const corrections = loadCorrections().filter((c) => c.id !== id);
  saveCorrections(corrections);
}

export function getAllCorrections(): Correction[] {
  return loadCorrections();
}

// 简单的关键词匹配搜索（复用 BM25 的 tokenize 逻辑）
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let buf = "";
  for (const ch of text) {
    if (/[一-鿿]/.test(ch)) {
      if (buf) { tokens.push(...buf.toLowerCase().split(/\s+/).filter(Boolean)); buf = ""; }
      tokens.push(ch);
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      buf += ch;
    } else {
      if (buf) { tokens.push(...buf.toLowerCase().split(/\s+/).filter(Boolean)); buf = ""; }
    }
  }
  if (buf) tokens.push(...buf.toLowerCase().split(/\s+/).filter(Boolean));
  return [...new Set(tokens)];
}

export function searchCorrections(query: string): Correction | null {
  const corrections = loadCorrections();
  if (corrections.length === 0) return null;

  const queryTokens = tokenize(query);
  let bestMatch: Correction | null = null;
  let bestScore = 0;

  for (const c of corrections) {
    const correctionTokens = tokenize(c.query);
    const overlap = queryTokens.filter((t) => correctionTokens.includes(t)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = c;
    }
  }

  // 至少需要2个token重叠才认为匹配
  if (bestScore >= 2 && bestMatch) {
    log(`Found correction match: "${bestMatch.query}" (score=${bestScore})`);
    return bestMatch;
  }

  return null;
}
