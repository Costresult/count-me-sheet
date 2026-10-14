// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VoiceLogPanel, VoiceMemoryPanel } from "@/components/countme/VoiceMemoryPanel";
import { cloudDocs } from "@/lib/countme/cloud";
import { useVoice } from "@/lib/voice/store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useVoice.setState({ panelOpen: false, logPanelOpen: false, aliases: [] } as never);
});

const alias = { id: "a", spokenAlias: "kori", normalizedAlias: "kori", targetProductIdentity: "BAHARAT KORI", targetProductName: "BAHARAT KORI", targetUnit: null, correctionCount: 1, lastUsed: 1, confidence: 0.45, source: "USER_SELECTION" };

function mockCloud() {
  vi.spyOn(cloudDocs, "getRecent").mockResolvedValue([
    { id: "v1", ts: 1, sessionId: null, kind: "matched", page: 1, heard: "köri toz 735 gram", suggested: "BAHARAT KORI | KILOGRAM = 0.735" },
  ]);
  vi.spyOn(cloudDocs, "getAll").mockResolvedValue([]);
  vi.spyOn(cloudDocs, "putMany").mockResolvedValue(undefined);
}

describe("learned names and voice records are separate windows", () => {
  it("'Öğrenilenler' shows only the learned names", async () => {
    mockCloud();
    useVoice.setState({ panelOpen: true, aliases: [alias] } as never);
    render(<><VoiceMemoryPanel /><VoiceLogPanel /></>);
    expect(await screen.findByText("Öğrenilen Telaffuzlar")).toBeTruthy();
    expect(screen.getByTestId("alias-item")).toBeTruthy();
    expect(screen.queryByText("Ses Kayıtları")).toBeNull();
    expect(screen.queryByText("Ses kayıt listesi")).toBeNull();
    expect(screen.queryByTestId("voice-recent-list")).toBeNull();
  });

  it("'Ses kayıtları' shows only the records, with CSV and the düzelt buttons", async () => {
    mockCloud();
    useVoice.setState({ logPanelOpen: true, aliases: [alias] } as never);
    render(<><VoiceMemoryPanel /><VoiceLogPanel /></>);
    expect(await screen.findByText("Ses Kayıtları")).toBeTruthy();
    expect(await screen.findByTestId("voice-entry")).toBeTruthy();
    expect(screen.getByTestId("voice-log-download")).toBeTruthy();
    expect(screen.getByTestId("flag-entry")).toBeTruthy();
    expect(screen.queryByTestId("alias-item")).toBeNull();
    expect(screen.queryByText("Öğrenilen Telaffuzlar")).toBeNull();
  });

  it("the two windows open independently", async () => {
    mockCloud();
    render(<><VoiceMemoryPanel /><VoiceLogPanel /></>);
    expect(screen.queryByText("Ses Kayıtları")).toBeNull();
    await act(async () => useVoice.getState().setLogPanelOpen(true));
    expect(await screen.findByText("Ses Kayıtları")).toBeTruthy();
    expect(useVoice.getState().panelOpen).toBe(false);
  });
});

describe("learned names list", () => {
  const more = (id: string, spoken: string, product: string, lastUsed: number, useCount?: number) => ({
    ...alias, id, spokenAlias: spoken, normalizedAlias: spoken, targetProductName: product, lastUsed, ...(useCount ? { useCount } : {}),
  });

  it("shows how often a name was used, most recently used first", async () => {
    mockCloud();
    useVoice.setState({
      panelOpen: true,
      aliases: [more("a", "kisnis", "KISNIS TANE", 1), more("b", "muskat", "MUSKAT TANE", 5, 3)],
    } as never);
    render(<VoiceMemoryPanel />);
    const items = await screen.findAllByTestId("alias-item");
    expect(items[0]!.textContent).toContain("muskat");
    expect(items[0]!.textContent).toContain("3× kullanıldı");
    expect(items[1]!.textContent).toContain("0× kullanıldı");
  });

  it("can be searched by the spoken or the product name", async () => {
    mockCloud();
    useVoice.setState({
      panelOpen: true,
      aliases: [more("a", "kisnis", "KISNIS TANE", 1), more("b", "muskat", "MUSKAT TANE", 5)],
    } as never);
    render(<VoiceMemoryPanel />);
    fireEvent.change(await screen.findByTestId("alias-search"), { target: { value: "muskat" } });
    expect(screen.getAllByTestId("alias-item")).toHaveLength(1);
    fireEvent.change(screen.getByTestId("alias-search"), { target: { value: "KİŞNİŞ" } });
    expect(screen.queryAllByTestId("alias-item")).toHaveLength(0);
    fireEvent.change(screen.getByTestId("alias-search"), { target: { value: "tane" } });
    expect(screen.getAllByTestId("alias-item")).toHaveLength(2);
  });
});
