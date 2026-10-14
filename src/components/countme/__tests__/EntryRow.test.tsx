// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { RecentVoiceList } from "@/components/countme/VoiceMemoryPanel";
import { cloudDocs } from "@/lib/countme/cloud";
import type { VoiceLogRecord } from "@/lib/voice/log";

const rec = (over: Partial<VoiceLogRecord>): VoiceLogRecord => ({
  id: "v1", ts: 3, sessionId: null, kind: "matched", page: 3,
  heard: "patlıcan közlenmiş 2 kilo 350 gram çarpı 6 adet", suggested: "PATLICAN KOZ KONSERVE | KILOGRAM = 14.1", ...over,
});

const stored = new Map<string, VoiceLogRecord>();
const seed = (...r: VoiceLogRecord[]) => {
  stored.clear();
  r.forEach((x) => stored.set(x.id, x));
  vi.spyOn(cloudDocs, "getRecent").mockImplementation(async () => [...stored.values()]);
  vi.spyOn(cloudDocs, "getAll").mockImplementation(async () => [...stored.values()]);
  vi.spyOn(cloudDocs, "putMany").mockImplementation(async () => undefined);
  vi.spyOn(cloudDocs, "get").mockImplementation(async (_s, id) => stored.get(id));
  vi.spyOn(cloudDocs, "put").mockImplementation(async (_s, v) => {
    stored.set((v as VoiceLogRecord).id, v as VoiceLogRecord);
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("saved voice list", () => {
  it("lists the saved records one by one (as after a page refresh), newest first, with a ✨ button each", async () => {
    seed(rec({ id: "a", ts: 1, heard: "malibu nokta iki" }), rec({ id: "b", ts: 2 }), rec({ id: "c", ts: 5, kind: "asked", heard: "step" }));
    const { findAllByTestId, queryByText } = render(<RecentVoiceList />);
    const rows = await findAllByTestId("voice-entry");
    expect(rows).toHaveLength(2); // the popup step ("asked") is not listed
    expect(rows[0]!.textContent).toContain("patlıcan közlenmiş");
    expect(rows[1]!.textContent).toContain("malibu nokta iki");
    expect(rows.every((r) => r.querySelector('[data-testid="flag-entry"]'))).toBe(true);
    expect(queryByText("step")).toBeNull();
  });

  it("flags a record with a note and shows it as sent", async () => {
    seed(rec({ id: "b", ts: 2 }));
    const { findByTestId, getByTestId } = render(<RecentVoiceList />);
    fireEvent.click(await findByTestId("flag-entry"));
    fireEvent.change(getByTestId("flag-note"), { target: { value: "14,1 yazmalıydı" } });
    fireEvent.click(getByTestId("flag-send"));
    await waitFor(() => expect(getByTestId("entry-flagged")).toBeTruthy());
    expect(stored.get("b")!.flag?.note).toBe("14,1 yazmalıydı");
  });

  it("shows records that were already flagged, with their note", async () => {
    seed(rec({ id: "b", flag: { at: 1, note: "14,1 olmalı" } }));
    const { findByTestId } = render(<RecentVoiceList />);
    expect((await findByTestId("voice-entry")).textContent).toContain("not: 14,1 olmalı");
    expect(await findByTestId("entry-flagged")).toBeTruthy();
  });

  it("tells the user when the list cannot be read", async () => {
    vi.spyOn(cloudDocs, "getRecent").mockRejectedValue(new Error("offline"));
    vi.spyOn(cloudDocs, "putMany").mockImplementation(async () => undefined);
    const { findByText } = render(<RecentVoiceList />);
    expect(await findByText(/Kayıtlar okunamadı/)).toBeTruthy();
  });
});

describe("fixed records", () => {
  it("say 'düzeltildi' once the fix is in", async () => {
    seed(rec({ id: "b", flag: { at: 1, note: "KORİ TOZ 0,735", done: true, fix: "öğrenilen ad cümle içinde de kullanılıyor" } }));
    const { findByTestId } = render(<RecentVoiceList />);
    expect((await findByTestId("voice-entry")).textContent).toContain("düzeltildi");
    expect((await findByTestId("entry-flagged")).getAttribute("title")).toContain("öğrenilen ad");
  });
});
