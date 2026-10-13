import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import ResetPassword from "@/pages/ResetPassword";
import Login from "@/pages/Login";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { renderWithClient } from "@/test/utils";

vi.mock("@/services/api", () => ({
  api: {
    login: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
    logout: vi.fn(),
    clearToken: vi.fn(),
  },
}));

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InUtMSJ9.sig";

function Address() {
  const location = useLocation();
  return <p data-testid="address">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(entry: string) {
  return renderWithClient(
    <AuthProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
        <Address />
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>, password: string, confirmation = password) {
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
  await user.click(screen.getByRole("button", { name: "Save new password" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getToken).mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("Reset password page", () => {
  it("takes the token out of the address bar and shows the form with the policy", async () => {
    renderAt(`/reset-password?token=${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent(/^\/reset-password$/));
    expect(screen.getByRole("heading", { level: 1, name: "Set a new password" })).toBeInTheDocument();
    const newPassword = screen.getByLabelText("New password");
    expect(newPassword).toHaveAttribute("type", "password");
    expect(newPassword).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("autocomplete", "new-password");
    expect(newPassword).toHaveAccessibleDescription(/Your new password must: have at least 10 characters/);
    expect(document.body.innerHTML).not.toContain(TOKEN);
  });

  it("checks the password before sending: length and a matching confirmation", async () => {
    const user = userEvent.setup();
    renderAt(`/reset-password?token=${TOKEN}`);
    await fill(user, "short");
    expect(await screen.findByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted fields.");
    await user.clear(screen.getByLabelText("New password"));
    await user.clear(screen.getByLabelText("Confirm new password"));
    await fill(user, "olive-grove-2026", "olive-grove-2027");
    expect(await screen.findByText("The passwords don't match. Enter the same new password twice.")).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("sets the new password with the link's token and goes to sign in with a notice", async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetPassword).mockResolvedValue(undefined);
    renderAt(`/reset-password?token=${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent(/^\/reset-password$/));
    await fill(user, "olive-grove-2026");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your password has been changed. Sign in with your new password."));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toHaveFocus();
    expect(api.resetPassword).toHaveBeenCalledWith(TOKEN, "olive-grove-2026");
    expect(api.clearToken).not.toHaveBeenCalled();
  });

  it("says the link is invalid or expired when the server refuses the token, and offers a new one", async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetPassword).mockRejectedValue(new ApiError("This reset link is invalid or has expired, or it was already used. Ask for a new one.", 401, "reset_link_invalid"));
    renderAt(`/reset-password?token=${TOKEN}`);
    await fill(user, "olive-grove-2026");
    const heading = await screen.findByRole("heading", { level: 1, name: "This link can't be used" });
    // The form (and its focused button) is gone: the focus moves to the new heading, not to the page (UX-3).
    expect(heading).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("The password reset link is invalid, has expired or was already used.");
    await user.click(screen.getByRole("link", { name: "Request a new link" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Reset your password" })).toBeInTheDocument();
  });

  it("ends a session this browser had (maybe another account's) so the sign-in notice is seen (UX-4)", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getUser).mockReturnValue({
      id: "u-9", email: "admin@example.org", fullName: "Admin", role: "org_admin", languagePref: "en", organization: { id: "org-1", name: "Org" },
    });
    vi.mocked(api.getToken).mockReturnValue("token");
    vi.mocked(api.clearToken).mockImplementation(() => {
      vi.mocked(api.getUser).mockReturnValue(null);
      vi.mocked(api.getToken).mockReturnValue(null);
    });
    vi.mocked(api.resetPassword).mockResolvedValue(undefined);
    renderAt(`/reset-password?token=${TOKEN}`);
    await fill(user, "olive-grove-2026");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(api.clearToken).toHaveBeenCalledOnce();
    expect(api.logout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your password has been changed."));
  });

  it("refuses a common password before sending, in the screen's language", async () => {
    const user = userEvent.setup();
    renderAt(`/reset-password?token=${TOKEN}`);
    await fill(user, "Password2026!");
    expect(await screen.findByText("This password is too easy to guess. Don't use a common password, Raqib or your organisation's name.")).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it("shows a password the server refused next to the field, in the screen's language", async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetPassword).mockRejectedValue(new ApiError("The new password must not contain the part of your email address before the @.", 400, "password_contains_email"));
    renderAt(`/reset-password?token=${TOKEN}`);
    await fill(user, "sara-olive-grove");
    expect(await screen.findByText("Don't include your email name (the part before @) in the password.")).toBeInTheDocument();
    expect(screen.queryByText(/must not contain/)).not.toBeInTheDocument();
  });

  it("says when Raqib cannot be reached, without losing what was typed", async () => {
    const user = userEvent.setup();
    vi.mocked(api.resetPassword).mockRejectedValue(new Error("Failed to fetch"));
    renderAt(`/reset-password?token=${TOKEN}`);
    await fill(user, "olive-grove-2026");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't reach Raqib. Check your connection and try again.");
    expect(screen.getByLabelText("New password")).toHaveValue("olive-grove-2026");
  });

  it("says a link without a token cannot be used", () => {
    renderAt("/reset-password");
    expect(screen.getByRole("heading", { level: 1, name: "This link can't be used" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/");
  });

  it("works in Arabic, right to left", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ar"]);
    renderAt(`/reset-password?token=${TOKEN}`);
    const heading = screen.getByRole("heading", { level: 1, name: "تعيين كلمة مرور جديدة" });
    expect(heading.closest("main")).toHaveAttribute("dir", "rtl");
    expect(screen.getByLabelText("كلمة المرور الجديدة")).toHaveAttribute("autocomplete", "new-password");
  });
});
