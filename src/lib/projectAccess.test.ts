import { describe, expect, it } from "vitest";
import { CAPABILITY_ROLES, PROJECT_WRITE_CAPABILITIES, can, type Capability } from "@/lib/permissions";
import { isArchivedProject, projectAccess } from "@/lib/projectAccess";

const CAPABILITIES = Object.keys(CAPABILITY_ROLES) as Capability[];
const ROLES = ["platform_admin", "org_admin", "me_officer", "donor_viewer", undefined, "", "auditor"];

describe("projectAccess", () => {
  it("follows the role matrix exactly while the project is not archived", () => {
    for (const status of ["setup", "framework_review", "active", "completed", undefined]) {
      for (const role of ROLES) {
        const access = projectAccess(role, { status });
        expect(access.archived).toBe(false);
        for (const capability of CAPABILITIES) expect(access.can(capability), `${role} ${status} ${capability}`).toBe(can(role, capability));
        expect(access.writable).toBe(can(role, "project.edit"));
      }
    }
  });

  it("turns every write off for everyone on an archived project, admins included", () => {
    for (const role of ROLES) {
      const access = projectAccess(role, { status: "archived" });
      expect(access.archived).toBe(true);
      expect(access.writable).toBe(false);
      for (const capability of PROJECT_WRITE_CAPABILITIES) expect(access.can(capability), `${role} ${capability}`).toBe(false);
    }
  });

  it("keeps reading, exports and the archive actions on an archived project", () => {
    const admin = projectAccess("org_admin", { status: "archived" });
    expect(admin.can("project.archive")).toBe(true);
    expect(admin.can("project.delete")).toBe(true);
    expect(admin.can("ai.review")).toBe(true);
    expect(admin.can("export.personalData")).toBe(true);
    const officer = projectAccess("me_officer", { status: "archived" });
    expect(officer.can("project.archive")).toBe(false);
    expect(officer.can("project.delete")).toBe(false);
    expect(officer.can("ai.review")).toBe(true);
    expect(officer.can("ai.run")).toBe(true);
  });

  it("answers staff in the staff shape and everyone else in the donor shape, archived or not", () => {
    for (const status of ["active", "archived"]) {
      expect(projectAccess("org_admin", { status }).audience).toBe("staff");
      expect(projectAccess("platform_admin", { status }).audience).toBe("staff");
      expect(projectAccess("me_officer", { status }).audience).toBe("staff");
      expect(projectAccess("donor_viewer", { status }).audience).toBe("donor");
      expect(projectAccess("auditor", { status }).audience).toBe("donor");
      expect(projectAccess(undefined, { status }).audience).toBe("donor");
    }
  });

  it("treats a missing project as not archived (the page waits for it)", () => {
    expect(isArchivedProject(undefined)).toBe(false);
    expect(isArchivedProject(null)).toBe(false);
    expect(isArchivedProject({ status: "ARCHIVED" })).toBe(false);
    expect(isArchivedProject({ status: "archived" })).toBe(true);
    expect(projectAccess("org_admin", null).archived).toBe(false);
  });
});
