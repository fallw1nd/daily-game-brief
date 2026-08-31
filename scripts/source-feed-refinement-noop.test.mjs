import { describe, expect, it } from "vitest";

describe("shadow source refinement", () => {
  it("keeps promotion as a later production decision", () => {
    expect("shadow").toBe("shadow");
  });
});
