import { openDB, type IDBPDatabase } from "idb";
import type { StoredSession } from "./types";

const DB_NAME = "countme";
const STORE = "sessions";

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveSession(session: StoredSession) {
  const d = await db();
  await d.put(STORE, session);
}

export async function loadSession(): Promise<StoredSession | null> {
  const d = await db();
  return ((await d.get(STORE, "active")) as StoredSession | undefined) ?? null;
}

export async function clearSession() {
  const d = await db();
  await d.delete(STORE, "active");
}