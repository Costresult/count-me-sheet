// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDB } from "idb";

const { cloud, save } = vi.hoisted(() => {
  const cloud = { sessions: [] as { id: string }[] };
  const save = vi.fn(async (s: { id: string }) => {
    cloud.sessions.push({ id: s.id });
  });
  return { cloud, save };
});

vi.mock("@/lib/countme/cloud", () => ({
  requireUserId: async () => "u1",
  cloudDocs: { getAll: async () => [], get: async () => undefined, put: vi.fn(async () => undefined) },
}));
vi.mock("@/lib/countme/storage", () => ({
  listSessions: async () => cloud.sessions,
  getSession: async (id: string) => (cloud.sessions.find((s) => s.id === id) ? { id } : null),
  saveSession: save,
}));

import { migrateLocalToCloud } from "@/lib/countme/migrateLocal";

async function seedLocal() {
  const db = await openDB("countme", 2, {
    upgrade(d) {
      d.createObjectStore("sessions", { keyPath: "id" });
      d.createObjectStore("index", { keyPath: "id" });
      d.createObjectStore("app");
    },
  });
  await db.put("sessions", { id: "s1", originalFile: new ArrayBuffer(4) });
  await db.put("index", { id: "s1" });
  db.close();
}
const localCount = async () => {
  const db = await openDB("countme");
  const n = (await db.getAll("sessions")).length;
  db.close();
  return n;
};

describe("local → cloud hand-over", () => {
  beforeEach(async () => {
    cloud.sessions = [];
    save.mockClear();
    window.localStorage.clear();
    const db = await openDB("countme");
    if (db.objectStoreNames.contains("sessions")) await db.clear("sessions");
    db.close();
  });

  it("imports into an empty account, clears local copies and runs only once", async () => {
    await seedLocal();
    expect(await migrateLocalToCloud()).toMatchObject({ sessions: 1 });
    expect(await localCount()).toBe(0);
    await seedLocal();
    expect(await migrateLocalToCloud()).toEqual({ sessions: 0, learned: 0 });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never brings back a deleted inventory when the account already has data", async () => {
    await seedLocal();
    cloud.sessions = [{ id: "other" }];
    await migrateLocalToCloud();
    expect(save).not.toHaveBeenCalled();
    expect(await localCount()).toBe(0);
  });
});
