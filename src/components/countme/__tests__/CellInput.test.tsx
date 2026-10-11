// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CellInput } from "@/components/countme/SheetGrid";
import { formatFormula } from "@/lib/countme/calc";
import type { SheetColumn } from "@/lib/countme/types";

const col: SheetColumn = {
  id: "v1", colNumber: 5, letter: "E", header: "Sayım 1", kind: "count", hidden: false, defaultWidth: 84,
};

afterEach(cleanup);

describe("cell with several readings", () => {
  it("is red and shows the sum on hover", () => {
    const { container } = render(
      <CellInput rowId="r1" col={col} base="" edited={2.4} isTarget={false} formula="0.8+1.6" />,
    );
    const input = container.querySelector("input")!;
    expect(input.className).toContain("text-red-600");
    expect(input.title).toBe("0,8+1,6 = 2.4");
  });

  it("stays normal for a single reading", () => {
    const { container } = render(<CellInput rowId="r1" col={col} base="" edited={0.8} isTarget={false} />);
    const input = container.querySelector("input")!;
    expect(input.className).not.toContain("text-red-600");
    expect(input.title).toBe("");
  });

  it("formats decimals with a comma", () => {
    expect(formatFormula("0.8+1.6+0.05")).toBe("0,8+1,6+0,05");
  });
});
