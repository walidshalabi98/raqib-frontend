import { describe, expect, it } from "vitest";
import { redactionTotal, removedPersonalData } from "@/lib/redactions";

describe("redactionTotal", () => {
  it("adds the phone, ID number and email counts", () => {
    expect(redactionTotal({ phone: 2, idNumber: 1, email: 3 })).toBe(6);
    expect(redactionTotal({ phone: 0, idNumber: 0, email: 1 })).toBe(1);
    expect(redactionTotal({ phone: 0, idNumber: 0, email: 0 })).toBe(0);
  });

  it("is 0 when an older backend sends no counts", () => {
    expect(redactionTotal(undefined)).toBe(0);
    expect(redactionTotal(null)).toBe(0);
    expect(redactionTotal({})).toBe(0);
  });

  it("ignores counts that are missing, negative or not numbers", () => {
    expect(redactionTotal({ phone: 1 })).toBe(1);
    expect(redactionTotal({ phone: -2, idNumber: 1, email: 0 })).toBe(1);
    expect(redactionTotal({ phone: Number.NaN, idNumber: Number.POSITIVE_INFINITY, email: 2 })).toBe(2);
    expect(redactionTotal({ phone: "3", idNumber: null, email: 1 } as never)).toBe(1);
  });
});

describe("removedPersonalData", () => {
  it("is true only when something was removed", () => {
    expect(removedPersonalData({ phone: 1, idNumber: 0, email: 0 })).toBe(true);
    expect(removedPersonalData({ phone: 0, idNumber: 0, email: 0 })).toBe(false);
    expect(removedPersonalData(undefined)).toBe(false);
  });
});
