import { openDB, type IDBPDatabase } from "idb";
import { normalizeText } from "./text";

/** Persistent pronunciation / alias memory. Learns conservatively from user corrections. */
export interface AliasRecord {
  id: string;
  spokenAlias: string;
  normalizedAlias: string;
  targetProductIdentity: string;
  targetProductName: string;
  targetUnit: string | null;
  correctionCount: number;
  lastUsed: number;
  confidence: number;
  source: "USER_SELECTION" | "USER_CORRECTION";
}

export interface CorrectionRecord {
  id: string;
  timestamp: number;
  sessionId: string | null;
  rawTranscript: string;
  aiCandidate: string | null;
  aiRowId: string | null;
  correctedRowId: string;
  correctedName: string;
  physicalPage: number | null;
  unitContext: string | null;
}

const DB_NAME = "countme-learning";
const ALIASES = "aliases";
const CORRECTIONS = "corrections";

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(ALIASES)) d.createObjectStore(ALIASES, { keyPath: "id" });
        if (!d.objectStoreNames.contains(CORRECTIONS))
          d.createObjectStore(CORRECTIONS, { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function listAliases(): Promise<AliasRecord[]> {
  try {
    return ((await (await db()).getAll(ALIASES)) as AliasRecord[]) ?? [];
  } catch {
    return [];
  }
}

export async function deleteAlias(id: string) {
  await (await db()).delete(ALIASES, id);
}

const MAX_CONFIDENCE = 0.95;

/**
 * Records a learned mapping. Explicit user selection is stronger evidence than
 * an automatic match; repeated confirmations raise confidence gradually so a
 * single accidental correction cannot dominate matching.
 */
export async function learnAlias(input: {
  spokenAlias: string;
  targetProductIdentity: string;
  targetProductName: string;
  targetUnit?: string | null;
  source?: AliasRecord["source"];
}): Promise<AliasRecord | null> {
  const spoken = input.spokenAlias.trim();
  const normalizedAlias = normalizeText(spoken);
  if (normalizedAlias.length < 2) return null;
  const id = `${normalizedAlias}::${normalizeText(input.targetProductIdentity)}`;
  const d = await db();
  const existing = (await d.get(ALIASES, id)) as AliasRecord | undefined;
  const base = input.source === "USER_CORRECTION" ? 0.45 : 0.4;
  const record: AliasRecord = existing
    ? {
        ...existing,
        correctionCount: existing.correctionCount + 1,
        lastUsed: Date.now(),
        confidence: Math.min(MAX_CONFIDENCE, existing.confidence + 0.18),
        targetUnit: input.targetUnit ?? existing.targetUnit,
      }
    : {
        id,
        spokenAlias: spoken,
        normalizedAlias,
        targetProductIdentity: input.targetProductIdentity,
        targetProductName: input.targetProductName,
        targetUnit: input.targetUnit ?? null,
        correctionCount: 1,
        lastUsed: Date.now(),
        confidence: base,
        source: input.source ?? "USER_SELECTION",
      };
  await d.put(ALIASES, record);

  // conflicting aliases for the same spoken form lose a little confidence
  const all = (await d.getAll(ALIASES)) as AliasRecord[];
  for (const a of all) {
    if (a.normalizedAlias === normalizedAlias && a.id !== id) {
      await d.put(ALIASES, { ...a, confidence: Math.max(0, a.confidence - 0.1) });
    }
  }
  return record;
}

export async function recordCorrection(rec: Omit<CorrectionRecord, "id" | "timestamp">) {
  const d = await db();
  await d.put(CORRECTIONS, {
    ...rec,
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  });
}

export async function listCorrections(): Promise<CorrectionRecord[]> {
  try {
    const all = ((await (await db()).getAll(CORRECTIONS)) as CorrectionRecord[]) ?? [];
    return all.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}
