import { describe, expect, it } from "vitest";
import { PROJECT_TAB_VALUES, projectTabFrom } from "./projectTabs";

describe("projectTabFrom", () => {
  it("opens the tab named in the link", () => {
    expect(projectTabFrom("me-framework")).toBe("me-framework");
    for (const tab of PROJECT_TAB_VALUES) expect(projectTabFrom(tab)).toBe(tab);
  });

  it("falls back to the overview for a missing or unknown tab", () => {
    expect(projectTabFrom(null)).toBe("overview");
    expect(projectTabFrom(undefined)).toBe("overview");
    expect(projectTabFrom("")).toBe("overview");
    expect(projectTabFrom("ME-FRAMEWORK")).toBe("overview");
    expect(projectTabFrom("constructor")).toBe("overview");
  });
});
