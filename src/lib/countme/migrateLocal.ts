import { openDB } from "idb";
import { cloudDocs, requireUserId, type DocStore } from "./cloud";
import { getSession, listSessions, saveSession } from "./storage";
import type { StoredSession } from "./types";

/**
 * One-time hand-over of what earlier versions kept only in this browser (IndexedDB).
 *
 * - Runs once per browser and user; the flag is only set when everything was handled.
 * - Imports only when the account is still empty; otherwise the cloud is the source of truth and
 *   the old local copies are simply discarded. Without that, anything you deleted would come back.
 * - Each local record is removed once it is safely in the cloud (or intentionally skipped), so a
 *   later run can never bring it back.
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

  const cloudHasData =
    (await listSessions()).length > 0 || (await cloudDocs.getAll("aliases")).length > 0;

  const sessionsDb = await openDB("countme");
  if (sessionsDb.objectStoreNames.contains("sessions")) {
    const all = (await sessionsDb.getAll("sessions")) as StoredSession[];
    for (const s of all) {
      if (s?.id && s.id !== "active" && s.originalFile && !cloudHasData && !(await getSession(s.id))) {
        await saveSession(s);
        done.sessions++;
      }
    }
    await sessionsDb.clear("sessions");
    if (sessionsDb.objectStoreNames.contains("index")) await sessionsDb.clear("index");
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
      if (!cloudHasData && r?.id && (await cloudDocs.get(remote, r.id)) === undefined) {
        await cloudDocs.put(remote, r);
        done.learned++;
      }
    }
    await learningDb.clear(local);
  }
  learningDb.close();

  window.localStorage.setItem(flag, "1");
  return done;
}
