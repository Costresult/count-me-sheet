// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { VoiceDecisionPopup } from "@/components/countme/VoiceDecisionPopup";
import { useVoice } from "@/lib/voice/store";
import type { ParsedUtterance } from "@/lib/voice/parser";

const utterance = { rawTranscript: "kişniş tane 900 gram", normalizedTranscript: "", productText: "kisnis", terms: [] } as unknown as ParsedUtterance;

function showPrompt() {
  useVoice.setState({
    prompt: {
      decisionId: "d1", utteranceId: "u1", utterance, confidence: "MEDIUM", productConfidence: "MEDIUM",
      unitConfidence: "HIGH", productScore: 0.92, productLabel: null, question: "Hangi ürün ve satır?",
      options: [{ rowId: "r1", label: "KISNIS TANE | KILOGRAM", score: 0.9, value: 1, note: "" }],
      aiBestRowId: "r1", kind: "product",
    },
  } as never);
}

// jsdom has no PointerEvent: without it clientX/clientY would not reach the handlers
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(cleanup);

describe("decision popup position", () => {
  it("can be dragged anywhere, is remembered, and resets on double click", () => {
    showPrompt();
    const { getByTestId, unmount } = render(<VoiceDecisionPopup />);
    const box = getByTestId("voice-decision-popup");
    const handle = getByTestId("voice-decision-handle");
    expect(box.style.left).toBe("");
    // jsdom has no layout: the popup sits at (880, 280) and the title bar is grabbed 20px inside it
    box.getBoundingClientRect = () => ({ left: 880, top: 280 }) as DOMRect;

    fireEvent.pointerDown(handle, { clientX: 900, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 300, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 300, clientY: 120, pointerId: 1 });
    expect(box.style.left).toBe("280px");
    expect(box.style.top).toBe("100px");

    unmount();
    const again = render(<VoiceDecisionPopup />);
    expect(again.getByTestId("voice-decision-popup").style.left).toBe("280px");

    fireEvent.doubleClick(again.getByTestId("voice-decision-handle"));
    expect(again.getByTestId("voice-decision-popup").style.left).toBe("");
  });

  it("keeps the popup on screen", () => {
    showPrompt();
    const { getByTestId } = render(<VoiceDecisionPopup />);
    const handle = getByTestId("voice-decision-handle");
    fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: -500, clientY: 5000, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    const box = getByTestId("voice-decision-popup");
    expect(parseInt(box.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseInt(box.style.top)).toBeLessThanOrEqual(800 - 48);
  });

  it("does not start a drag from the close button", () => {
    showPrompt();
    const { getByTestId } = render(<VoiceDecisionPopup />);
    const close = getByTestId("voice-decision-close");
    fireEvent.pointerDown(close, { clientX: 900, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(getByTestId("voice-decision-handle"), { clientX: 100, clientY: 100, pointerId: 1 });
    expect(getByTestId("voice-decision-popup").style.left).toBe("");
  });
});
