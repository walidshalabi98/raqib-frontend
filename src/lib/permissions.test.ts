import { describe, expect, it } from "vitest";
import { ADMIN_ROLES, CAPABILITY_ROLES, STAFF_ROLES, USER_ROLES, can, isUserRole, type Capability } from "@/lib/permissions";

/**
 * The backend role matrix (backend docs/SECURITY_SETUP.md §8, tests/roles.test.ts), written out
 * literally so a change to either side is a visible, reviewed change.
 */
const EXPECTED: Record<Capability, string[]> = {
  "project.create": ["org_admin", "platform_admin"],
  "project.edit": ["me_officer", "org_admin", "platform_admin"],
  "project.archive": ["org_admin", "platform_admin"],
  "framework.edit": ["me_officer", "org_admin", "platform_admin"],
  "framework.approve": ["org_admin", "platform_admin"],
  "data.enter": ["me_officer", "org_admin", "platform_admin"],
  "beneficiary.records": ["me_officer", "org_admin", "platform_admin"],
  "document.manage": ["me_officer", "org_admin", "platform_admin"],
  "qualitative.manage": ["me_officer", "org_admin", "platform_admin"],
  "ai.run": ["me_officer", "org_admin", "platform_admin"],
  "ai.review": ["me_officer", "org_admin", "platform_admin"],
  "assessment.request": ["me_officer", "org_admin", "platform_admin"],
  "assessment.update": ["org_admin", "platform_admin"],
  "report.generate": ["me_officer", "org_admin", "platform_admin"],
  "export.personalData": ["me_officer", "org_admin", "platform_admin"],
  "org.manage": ["org_admin", "platform_admin"],
  "users.manage": ["org_admin", "platform_admin"],
  "templates.manage": ["platform_admin"],
};

const CAPABILITIES = Object.keys(EXPECTED) as Capability[];

describe("permissions", () => {
  it("mirrors the backend role matrix exactly", () => {
    const actual = Object.fromEntries(Object.entries(CAPABILITY_ROLES).map(([cap, roles]) => [cap, [...roles].sort()]));
    expect(actual).toEqual(EXPECTED);
    expect([...STAFF_ROLES].sort()).toEqual(["me_officer", "org_admin", "platform_admin"]);
    expect([...ADMIN_ROLES].sort()).toEqual(["org_admin", "platform_admin"]);
  });

  it("gives donor viewers no capability at all", () => {
    for (const capability of CAPABILITIES) expect(can("donor_viewer", capability), capability).toBe(false);
  });

  it("denies by default: missing, empty, unknown or differently cased roles get nothing", () => {
    for (const role of [undefined, null, "", "admin", "ORG_ADMIN", " org_admin", "donor", "__proto__", "toString"]) {
      for (const capability of CAPABILITIES) expect(can(role, capability), `${String(role)} ${capability}`).toBe(false);
    }
    expect(can("org_admin", "unknown.capability" as Capability)).toBe(false);
    expect(can("org_admin", "toString" as Capability)).toBe(false);
  });

  it("keeps M&E officers out of admin actions", () => {
    expect(can("me_officer", "project.edit")).toBe(true);
    expect(can("me_officer", "beneficiary.records")).toBe(true);
    expect(can("me_officer", "project.create")).toBe(false);
    expect(can("me_officer", "project.archive")).toBe(false);
    expect(can("me_officer", "framework.approve")).toBe(false);
    expect(can("me_officer", "users.manage")).toBe(false);
    expect(can("me_officer", "templates.manage")).toBe(false);
  });

  it("lets admins do everything except managing templates, which is for platform admins", () => {
    for (const capability of CAPABILITIES) {
      expect(can("org_admin", capability), capability).toBe(capability !== "templates.manage");
      expect(can("platform_admin", capability), capability).toBe(true);
    }
  });

  it("recognises exactly the four roles and cannot be changed at run time", () => {
    expect(USER_ROLES).toEqual(["platform_admin", "org_admin", "me_officer", "donor_viewer"]);
    expect(isUserRole("donor_viewer")).toBe(true);
    expect(isUserRole("viewer")).toBe(false);
    expect(isUserRole(42)).toBe(false);
    expect(Object.isFrozen(CAPABILITY_ROLES)).toBe(true);
    expect(Object.isFrozen(STAFF_ROLES)).toBe(true);
    expect(() => (STAFF_ROLES as string[]).push("donor_viewer")).toThrow();
  });
});
