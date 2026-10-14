// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EntryRow } from "@/components/countme/VoiceMemoryPanel";
import { useVoice, type TranscriptEntry } from "@/lib/voice/store";

const entry: TranscriptEntry = {
  id: "t1", rawTranscript: "patlıcan közlenmiş 2 kilo 350 gram çarpı 6 adet", normalizedTranscript: "",
  timestamp: 1, sessionId: null, physicalPage: 3, outcome: "written", detail: "PATLICAN KOZ KONSERVE = 14.1",
};

afterEach(cleanup);

describe("entry row 'düzelt' button", () => {
  it("sends the note and then shows it as flagged", async () => {
    const flagEntry = vi.fn(async () => true);
    useVoice.setState({ flagEntry, entries: [entry] } as never);
    const { getByTestId, queryByTestId, rerender } = render(<EntryRow entry={entry} />);

    fireEvent.click(getByTestId("flag-entry"));
    fireEvent.change(getByTestId("flag-note"), { target: { value: "14,1 yazmalıydı" } });
    fireEvent.click(getByTestId("flag-send"));
    await waitFor(() => expect(flagEntry).toHaveBeenCalledWith("t1", "14,1 yazmalıydı"));

    rerender(<EntryRow entry={{ ...entry, flagged: true }} />);
    expect(queryByTestId("flag-entry")).toBeNull();
  });

  it("works without a note and tells the user when it fails", async () => {
    const flagEntry = vi.fn(async () => false);
    useVoice.setState({ flagEntry } as never);
    const { getByTestId, findByText } = render(<EntryRow entry={entry} />);
    fireEvent.click(getByTestId("flag-entry"));
    fireEvent.click(getByTestId("flag-send"));
    expect(await findByText("İşaretlenemedi, tekrar deneyin.")).toBeTruthy();
    expect(flagEntry).toHaveBeenCalledWith("t1", "");
  });
});
