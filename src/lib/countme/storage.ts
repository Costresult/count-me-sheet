import { openDB, type IDBPDatabase } from "idb";
import type { SessionMeta, StoredSession } from "./types";

const DB_NAME = "countme";
const STORE = "sessions";
const INDEX = "index";
const APP = "app";

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(INDEX)) {
          database.createObjectStore(INDEX, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(APP)) {
          database.createObjectStore(APP);
        }
      },
    });
  }
  return dbPromise;
}

export const toMeta = (s: StoredSession): SessionMeta => ({
  id: s.id,
  name: s.name,
  fileName: s.fileName,
  sheetName: s.sheetName,
  status: s.status,
  editCount: Object.keys(s.edits ?? {}).length,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

export async function saveSession(session: StoredSession) {
  const d = await db();
  await d.put(STORE, session);
  await d.put(INDEX, toMeta(session));
}

export async function getSession(id: string): Promise<StoredSession | null> {
  const d = await db();
  return ((await d.get(STORE, id)) as StoredSession | undefined) ?? null;
}

export async function listSessions(): Promise<SessionMeta[]> {
  const d = await db();
  const metas = ((await d.getAll(INDEX)) as SessionMeta[]) ?? [];
  if (metas.length === 0) {
    // migrate legacy single-session record
    const legacy = (await d.get(STORE, "active")) as StoredSession | undefined;
    if (legacy) {
      const migrated: StoredSession = {
        ...legacy,
        id: `s${Date.now()}`,
        name: legacy.fileName?.replace(/\.xls[xm]$/i, "") ?? "Envanter",
        createdAt: legacy.updatedAt ?? Date.now(),
      };
      await d.delete(STORE, "active");
      await saveSession(migrated);
      return [toMeta(migrated)];
    }
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(id: string) {
  const d = await db();
  await d.delete(STORE, id);
  await d.delete(INDEX, id);
  const active = await getActiveId();
  if (active === id) await setActiveId(null);
}

export async function renameSession(id: string, name: string) {
  const s = await getSession(id);
  if (!s) return;
  await saveSession({ ...s, name, updatedAt: Date.now() });
}

export async function setActiveId(id: string | null) {
  const d = await db();
  if (id === null) await d.delete(APP, "activeId");
  else await d.put(APP, id, "activeId");
}

export async function getActiveId(): Promise<string | null> {
  const d = await db();
  return ((await d.get(APP, "activeId")) as string | undefined) ?? null;
}
