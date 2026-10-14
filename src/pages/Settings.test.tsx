import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import SettingsPage from "@/pages/Settings";
import { AuthProvider } from "@/contexts/AuthContext";
import { PasswordHandoverProvider } from "@/components/settings/PasswordHandover";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, OrgUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
    getUsers: vi.fn(),
    inviteUser: vi.fn(),
    resetUserPassword: vi.fn(),
    changePassword: vi.fn(),
    updateOrganization: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const members: OrgUser[] = [
  { id: "u-admin", email: "maha@example.org", fullName: "Maha Admin", role: "org_admin" },
  { id: "u-2", email: "omar@example.org", fullName: "Omar Saleh", role: "me_officer" },
  { id: "u-3", email: "donor@example.org", fullName: "Donor Desk", role: "donor_viewer" },
  { id: "u-4", email: "ops@example.org", fullName: "Platform Ops", role: "platform_admin" },
];

/** The bidirectional isolates around a name in translated text are not visible: compare without them. */
const plain = (text: string) => text.replace(/[\u2068\u2069]/g, "");
const named = (text: string) => (name: string) => plain(name) === text;

function signInAs(role: string, languagePref = "en", email = "maha@example.org") {
  const user: AuthUser = { id: "u-admin", email, fullName: "Maha Admin", role, languagePref, organization: { id: "org-1", name: "Hebron Youth NGO" } };
  vi.mocked(api.getUser).mockReturnValue(user);
}

/** The page as the app renders it: the one-time password dialog lives above the routes. */
function tree(page = <SettingsPage />) {
  return (
    <AuthProvider>
      <PasswordHandoverProvider>
        <MemoryRouter>{page}</MemoryRouter>
      </PasswordHandoverProvider>
    </AuthProvider>
  );
}

function renderPage() {
  return renderWithClient(tree());
}

/** A promise the test settles when it wants. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Fires beforeunload and says whether the page asked the browser to confirm leaving. */
function leavingIsQuestioned() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUsers).mockResolvedValue(members);
});

afterEach(() => vi.unstubAllEnvs());

describe("Settings: change password (every role)", () => {
  it.each(["donor_viewer", "me_officer"])("gives a %s the Change password section only, without team or organisation", (role) => {
    signInAs(role);
    renderPage();
    expect(screen.getByRole("region", { name: "Change password" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Team members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Organisation" })).not.toBeInTheDocument();
    expect(api.getUsers).not.toHaveBeenCalled();
  });

  it("checks the policy before sending, then changes the password, empties the form and confirms", async () => {
    const user = userEvent.setup();
    signInAs("donor_viewer", "en", "sara@example.org");
    vi.mocked(api.changePassword).mockResolvedValue(undefined);
    renderPage();
    const section = screen.getByRole("region", { name: "Change password" });
    const current = within(section).getByLabelText("Current password");
    const next = within(section).getByLabelText("New password");
    const confirm = within(section).getByLabelText("Confirm new password");
    expect(current).toHaveAttribute("autocomplete", "current-password");
    expect(next).toHaveAttribute("autocomplete", "new-password");
    expect(next).toHaveAccessibleDescription(/have at least 10 characters/);

    await user.type(current, "temporary-1");
    await user.type(next, "sara-olive-grove");
    await user.type(confirm, "something-else");
    await user.click(within(section).getByRole("button", { name: "Change password" }));
    expect(await within(section).findByText("Don't include your email name (the part before @) in the password.")).toBeInTheDocument();
    expect(within(section).getByText("The passwords don't match. Enter the same new password twice.")).toBeInTheDocument();
    expect(within(section).getByRole("alert")).toHaveTextContent("Check the highlighted fields.");
    expect(api.changePassword).not.toHaveBeenCalled();

    await user.clear(next);
    await user.type(next, "olive-grove-2026");
    await user.clear(confirm);
    await user.type(confirm, "olive-grove-2026");
    await user.click(within(section).getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Your password has been changed."));
    expect(api.changePassword).toHaveBeenCalledWith("temporary-1", "olive-grove-2026");
    expect(current).toHaveValue("");
    expect(next).toHaveValue("");
    expect(confirm).toHaveValue("");
  });

  it("refuses a common password or one with the organisation's name before sending (as the server does)", async () => {
    const user = userEvent.setup();
    signInAs("me_officer");
    renderPage();
    const section = screen.getByRole("region", { name: "Change password" });
    expect(within(section).getByLabelText("New password")).toHaveAccessibleDescription(/use at least 4 different characters.*not be a common password/);
    for (const password of ["Hebron-Youth-2026", "Password2026!"]) {
      await user.clear(within(section).getByLabelText("New password"));
      await user.type(within(section).getByLabelText("Current password"), "x");
      await user.type(within(section).getByLabelText("New password"), password);
      await user.click(within(section).getByRole("button", { name: "Change password" }));
      expect(await within(section).findByText("This password is too easy to guess. Don't use a common password, Raqib or your organisation's name.")).toBeInTheDocument();
    }
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("names the page in the tab title", () => {
    signInAs("me_officer");
    const { unmount } = renderPage();
    expect(document.title).toBe("Settings · Raqib by Momentum Labs");
    unmount();
    expect(document.title).not.toContain("Settings");
  });

  it("shows a wrong current password on that field", async () => {
    const user = userEvent.setup();
    signInAs("me_officer");
    vi.mocked(api.changePassword).mockRejectedValue(new ApiError("The current password is incorrect.", 400, "current_password_incorrect"));
    renderPage();
    const section = screen.getByRole("region", { name: "Change password" });
    await user.type(within(section).getByLabelText("Current password"), "not-it");
    await user.type(within(section).getByLabelText("New password"), "olive-grove-2026");
    await user.type(within(section).getByLabelText("Confirm new password"), "olive-grove-2026");
    await user.click(within(section).getByRole("button", { name: "Change password" }));
    expect(await within(section).findByText("Your current password is not correct.")).toBeInTheDocument();
    expect(within(section).getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("is in Arabic, right to left, for an Arabic-speaking user", () => {
    signInAs("donor_viewer", "ar");
    renderPage();
    const heading = screen.getByRole("heading", { level: 1, name: "الإعدادات" });
    expect(heading.parentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("region", { name: "تغيير كلمة المرور" })).toBeInTheDocument();
    expect(screen.getByLabelText("كلمة المرور الحالية")).toBeInTheDocument();
  });
});

describe("Settings: team members (org admins)", () => {
  it("lists the team with role labels and offers Reset password for others only, not for a platform admin", async () => {
    signInAs("org_admin");
    renderPage();
    const team = screen.getByRole("region", { name: "Team members" });
    expect(await within(team).findByText("Omar Saleh")).toBeInTheDocument();
    // The role shows in a column on wide screens and under the name on phones (CSS shows one of the two).
    expect(within(team).getAllByText("M&E officer")).toHaveLength(2);
    expect(within(team).getAllByText("Donor viewer")).toHaveLength(2);
    const reset = within(team).getByRole("button", { name: named("Reset password for Omar Saleh") });
    // The visible label stays on phones too (no icon-only button).
    expect(within(reset).getByText("Reset password")).not.toHaveClass("hidden");
    expect(within(team).getByRole("button", { name: named("Reset password for Donor Desk") })).toBeInTheDocument();
    expect(within(team).queryByRole("button", { name: /Reset password for .*Maha Admin/ })).not.toBeInTheDocument();
    expect(within(team).queryByRole("button", { name: /Reset password for .*Platform Ops/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Organisation" })).toBeInTheDocument();
  });

  it("invites a user and shows the temporary password once, with a copy button and the warning", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    signInAs("org_admin");
    vi.mocked(api.inviteUser).mockResolvedValue({
      id: "u-9",
      email: "lina@example.org",
      fullName: "Lina Odeh",
      role: "donor_viewer",
      emailSent: false,
      temporaryPassword: "Tmp-7f3a9c2e-K",
    });
    renderPage();
    await screen.findByText("Omar Saleh");

    const inviteButton = screen.getByRole("button", { name: "Invite user" });
    await user.click(inviteButton);
    const form = await screen.findByRole("dialog", { name: "Invite user" });
    await user.type(within(form).getByLabelText(/Full name/), " Lina Odeh ");
    await user.type(within(form).getByLabelText(/Email/), "lina@example.org");
    await user.selectOptions(within(form).getByLabelText(/Role/), "donor_viewer");
    await user.click(within(form).getByRole("button", { name: "Invite" }));

    const shown = await screen.findByRole("alertdialog", { name: named("Lina Odeh was added") });
    expect(api.inviteUser).toHaveBeenCalledWith({ fullName: "Lina Odeh", email: "lina@example.org", role: "donor_viewer" });
    // The focus starts in the dialog, on Copy password, and stays there (UX-1).
    await waitFor(() => expect(within(shown).getByRole("button", { name: "Copy password" })).toHaveFocus());
    await user.tab();
    expect(within(shown).getByRole("button", { name: "Done" })).toHaveFocus();
    await user.tab();
    expect(shown).toContainElement(document.activeElement as HTMLElement);
    expect(within(shown).getByText("Tmp- 7f3a 9c2e -K")).toBeInTheDocument();
    expect(within(shown).queryByText(/The email could not be sent/)).not.toBeInTheDocument();
    const password = within(shown).getByLabelText("Temporary password");
    expect(password).toHaveValue("Tmp-7f3a9c2e-K");
    expect(password).toHaveAttribute("readonly");
    expect(within(shown).getByText("Shown only once")).toBeInTheDocument();
    expect(within(shown).getByText("You can't see this password again after you close this window.")).toBeInTheDocument();
    expect(within(shown).getByText(/Share it privately/)).toBeInTheDocument();
    expect(within(shown).getByText(/Ask them to change it after signing in/)).toBeInTheDocument();

    await user.click(within(shown).getByRole("button", { name: "Copy password" }));
    expect(writeText).toHaveBeenCalledWith("Tmp-7f3a9c2e-K");
    expect(await within(shown).findByText("Password copied.")).toBeInTheDocument();

    await user.click(within(shown).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain("Tmp-7f3a9c2e-K");
    expect(inviteButton).toHaveFocus();
    await waitFor(() => expect(api.getUsers).toHaveBeenCalledTimes(2));
  });

  it("says when copying fails, so the admin copies it by hand", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    signInAs("org_admin");
    vi.mocked(api.resetUserPassword).mockResolvedValue({ emailSent: false, temporaryPassword: "Tmp-1" });
    renderPage();
    await user.click(await screen.findByRole("button", { name: named("Reset password for Omar Saleh") }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset password" }));
    const shown = await screen.findByRole("alertdialog", { name: named("New password for Omar Saleh") });
    await user.click(within(shown).getByRole("button", { name: "Copy password" }));
    expect(await within(shown).findByText("Copying didn't work. Select the password and copy it yourself.")).toBeInTheDocument();
    expect(within(shown).getByLabelText("Temporary password")).toHaveFocus();
  });

  it("only confirms by email when the invitation was emailed", async () => {
    const user = userEvent.setup();
    signInAs("org_admin");
    vi.mocked(api.inviteUser).mockResolvedValue({ id: "u-9", email: "lina@example.org", fullName: "Lina Odeh", role: "me_officer", emailSent: true });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Invite user" }));
    const form = await screen.findByRole("dialog", { name: "Invite user" });
    await user.type(within(form).getByLabelText(/Full name/), "Lina Odeh");
    await user.type(within(form).getByLabelText(/Email/), "lina@example.org");
    await user.click(within(form).getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("⁨Lina Odeh⁩ was invited. We emailed them a link to choose their password."));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("checks the invite form and shows an email already in use on the field", async () => {
    const user = userEvent.setup();
    signInAs("org_admin");
    vi.mocked(api.inviteUser).mockRejectedValue(new ApiError("A user with this email already exists", 409));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Invite user" }));
    const form = await screen.findByRole("dialog", { name: "Invite user" });
    await user.click(within(form).getByRole("button", { name: "Invite" }));
    expect(await within(form).findByText("Enter the user's full name.")).toBeInTheDocument();
    expect(within(form).getByText("Enter the user's email.")).toBeInTheDocument();
    expect(api.inviteUser).not.toHaveBeenCalled();
    await user.type(within(form).getByLabelText(/Full name/), "Omar Saleh");
    await user.type(within(form).getByLabelText(/Email/), "omar@example.org");
    await user.click(within(form).getByRole("button", { name: "Invite" }));
    expect(await within(form).findByText("A user with this email already exists.")).toBeInTheDocument();
    expect(within(form).getByLabelText(/Email/)).toHaveAttribute("aria-invalid", "true");
  });

  it("asks before resetting a member's password, then shows the new temporary password once", async () => {
    const user = userEvent.setup();
    signInAs("org_admin");
    vi.mocked(api.resetUserPassword).mockResolvedValue({ emailSent: false, temporaryPassword: "Tmp-2b8d41f0-Q" });
    renderPage();
    const rowButton = await screen.findByRole("button", { name: named("Reset password for Omar Saleh") });

    await user.click(rowButton);
    let confirm = await screen.findByRole("alertdialog", { name: named("Reset the password of Omar Saleh?") });
    expect(within(confirm).getByText(/stops working straight away/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.resetUserPassword).not.toHaveBeenCalled();
    expect(rowButton).toHaveFocus();

    await user.click(rowButton);
    confirm = await screen.findByRole("alertdialog", { name: named("Reset the password of Omar Saleh?") });
    await user.click(within(confirm).getByRole("button", { name: "Reset password" }));
    const shown = await screen.findByRole("alertdialog", { name: named("New password for Omar Saleh") });
    expect(api.resetUserPassword).toHaveBeenCalledWith("u-2");
    expect(within(shown).getByLabelText("Temporary password")).toHaveValue("Tmp-2b8d41f0-Q");
    expect(within(shown).getByText(/They sign in with/)).toHaveTextContent("omar@example.org");
    await waitFor(() => expect(within(shown).getByRole("button", { name: "Copy password" })).toHaveFocus());

    // Escape does not close it, and neither does Done before the password was copied (UX-2).
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog", { name: named("New password for Omar Saleh") })).toBeInTheDocument();
    expect(leavingIsQuestioned()).toBe(true);
    await user.click(within(shown).getByRole("button", { name: "Done" }));
    expect(within(shown).getByRole("alert")).toHaveTextContent("Close without copying the password? You can't see it again.");
    expect(within(shown).getByRole("button", { name: "Go back" })).toHaveFocus();
    await user.click(within(shown).getByRole("button", { name: "Go back" }));
    expect(within(shown).getByRole("button", { name: "Copy password" })).toHaveFocus();
    expect(within(shown).getByLabelText("Temporary password")).toHaveValue("Tmp-2b8d41f0-Q");
    await user.click(within(shown).getByRole("button", { name: "Done" }));
    await user.click(within(shown).getByRole("button", { name: "Close anyway" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain("Tmp-2b8d41f0-Q");
    expect(rowButton).toHaveFocus();
    expect(leavingIsQuestioned()).toBe(false);
  });

  it("shows the password even when the admin left Settings before the answer came (SR-8)", async () => {
    const user = userEvent.setup();
    signInAs("org_admin");
    const answer = deferred<{ emailSent: boolean; temporaryPassword: string }>();
    vi.mocked(api.resetUserPassword).mockReturnValue(answer.promise);
    const { rerender } = renderPage();
    await user.click(await screen.findByRole("button", { name: named("Reset password for Omar Saleh") }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset password" }));
    // Browser Back while the request runs: Settings goes away, the providers stay.
    rerender(tree(<p>Dashboard screen</p>));
    expect(screen.queryByRole("region", { name: "Team members" })).not.toBeInTheDocument();
    await act(async () => answer.resolve({ emailSent: false, temporaryPassword: "Tmp-after-leaving-7" }));
    const shown = await screen.findByRole("alertdialog", { name: named("New password for Omar Saleh") });
    expect(within(shown).getByLabelText("Temporary password")).toHaveValue("Tmp-after-leaving-7");
    await user.click(within(shown).getByRole("button", { name: "Done" }));
    await user.click(within(shown).getByRole("button", { name: "Close anyway" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain("Tmp-after-leaving-7");
  });

  it("with email on, explains that the email failed when a password comes back, and describes the email flow", async () => {
    vi.stubEnv("VITE_EMAIL_ENABLED", "true");
    const user = userEvent.setup();
    signInAs("org_admin");
    vi.mocked(api.resetUserPassword).mockResolvedValue({ emailSent: false, temporaryPassword: "Tmp-email-failed-3" });
    renderPage();
    await user.click(await screen.findByRole("button", { name: named("Reset password for Omar Saleh") }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(/Raqib emails them a link to choose a new one/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "Reset password" }));
    const shown = await screen.findByRole("alertdialog", { name: named("New password for Omar Saleh") });
    expect(within(shown).getByText("The email could not be sent, so give them this password yourself.")).toBeInTheDocument();
  });

  it("describes the invitation by how the password reaches them", async () => {
    const user = userEvent.setup();
    signInAs("org_admin");
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Invite user" }));
    expect(await screen.findByRole("dialog", { name: "Invite user" })).toHaveAccessibleDescription(
      "You'll see a temporary password once, to give to them privately. They change it after signing in.",
    );
  });

  it("says when a reset failed or was refused", async () => {
    const user = userEvent.setup();
    signInAs("org_admin");
    vi.mocked(api.resetUserPassword).mockRejectedValueOnce(new ApiError("Server error", 500)).mockRejectedValueOnce(new ApiError("Insufficient permissions", 403));
    renderPage();
    const rowButton = await screen.findByRole("button", { name: named("Reset password for Omar Saleh") });
    await user.click(rowButton);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't reset this password. Try again in a few minutes."));
    await user.click(rowButton);
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/^You don't have permission/)));
    expect(screen.queryByRole("alertdialog", { name: /New password/ })).not.toBeInTheDocument();
  });

  it("explains a list that failed to load and retries", async () => {
    const user = userEvent.setup();
    signInAs("org_admin");
    vi.mocked(api.getUsers).mockRejectedValueOnce(new ApiError("Server error", 500));
    renderPage();
    const team = screen.getByRole("region", { name: "Team members" });
    expect(await within(team).findByRole("alert")).toHaveTextContent("We couldn't load the team members.");
    await user.click(within(team).getByRole("button", { name: "Try again" }));
    expect(await within(team).findByText("Omar Saleh")).toBeInTheDocument();
  });
});
