import { describe, expect, it } from "vitest";
import { INVITE_ROLES, emptyInviteForm, inviteFormToPayload, inviteUserSchema } from "@/lib/userForm";

describe("invite user form", () => {
  it("needs a name and a valid email, and offers the organisation's roles only", () => {
    expect(INVITE_ROLES).toEqual(["me_officer", "donor_viewer", "org_admin"]);
    expect(emptyInviteForm().role).toBe("me_officer");
    const result = inviteUserSchema.safeParse({ fullName: "  ", email: "not-an-email", role: "me_officer" });
    expect(result.success).toBe(false);
    expect(Object.fromEntries(result.error!.issues.map((i) => [i.path.join("."), i.message]))).toEqual({
      fullName: "nameRequired",
      email: "emailInvalid",
    });
    expect(inviteUserSchema.safeParse({ fullName: "Lina", email: "", role: "donor_viewer" }).error!.issues[0].message).toBe("emailRequired");
    expect(inviteUserSchema.safeParse({ fullName: "Lina", email: "lina@example.org", role: "platform_admin" }).success).toBe(false);
  });

  it("sends the name and email trimmed", () => {
    expect(inviteFormToPayload({ fullName: " Lina Odeh ", email: " lina@example.org ", role: "donor_viewer" })).toEqual({
      fullName: "Lina Odeh",
      email: "lina@example.org",
      role: "donor_viewer",
    });
  });
});
