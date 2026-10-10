import { openDB } from "idb";
import { cloudDocs, requireUserId, type DocStore } from "./cloud";
import { getSession, saveSession } from "./storage";
import type { StoredSession } from "./types";

/**
 * One-time import of what earlier versions kept only in this browser (IndexedDB):
 * inventories and learned aliases/corrections. Never overwrites anything already in the cloud.
 */
export async function migrateLocalToCloud(): Promise<{ sessions: number; learned: number }> {
  const uid = await requireUserId();
  const flag = `countme-local-migrated:${uid}`;
  const done = { sessions: 0, learned: 0 };
  try {
    if (typeof window === "undefined" || window.localStorage.getItem(flag)) return done;
  } catch {
    return done;
  }

  const sessionsDb = await openDB("countme");
  if (sessionsDb.objectStoreNames.contains("sessions")) {
    const all = (await sessionsDb.getAll("sessions")) as StoredSession[];
    for (const s of all) {
      if (!s?.id || s.id === "active" || !s.originalFile) continue;
      if (await getSession(s.id)) continue;
      await saveSession(s);
      done.sessions++;
    }
  }
  sessionsDb.close();

  const learningDb = await openDB("countme-learning");
  const stores: [string, DocStore][] = [
    ["aliases", "aliases"],
    ["corrections", "corrections"],
    ["unitmap", "unitmap"],
  ];
  for (const [local, remote] of stores) {
    if (!learningDb.objectStoreNames.contains(local)) continue;
    const records = (await learningDb.getAll(local)) as { id: string }[];
    for (const r of records) {
      if (!r?.id) continue;
      if ((await cloudDocs.get(remote, r.id)) !== undefined) continue;
      await cloudDocs.put(remote, r);
      done.learned++;
    }
  }
  learningDb.close();

  window.localStorage.setItem(flag, "1");
  return done;
}
