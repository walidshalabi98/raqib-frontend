import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Login from "@/pages/Login";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { ApiError } from "@/lib/apiError";
import { renderWithClient } from "@/test/utils";
import type { AuthUser, LoginResponse } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    login: vi.fn(),
    forgotPassword: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
    logout: vi.fn(),
  },
}));

const sara: AuthUser = { id: "u-1", email: "sara@example.org", fullName: "Sara", role: "me_officer", languagePref: "en", organization: { id: "org-1", name: "Org" } };

/** The current history entry's state, as JSON. */
function HistoryState() {
  return <p data-testid="history-state">{JSON.stringify(useLocation().state ?? null)}</p>;
}

function renderLogin(entry: string | { pathname: string; state?: unknown } = "/") {
  return renderWithClient(
    <AuthProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<p>Dashboard screen</p>} />
        </Routes>
        <HistoryState />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getToken).mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Login", () => {
  it("starts empty, with the autocomplete hints password managers need, and no demo account", () => {
    const { container } = renderLogin();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    expect(email).toHaveValue("");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toHaveAttribute("name", "email");
    expect(password).toHaveValue("");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(container.innerHTML).not.toMatch(/admin123|admin@momentumlabs/);
  });

  it("asks for both fields before sending anything", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email and password.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(api.login).not.toHaveBeenCalled();
  });

  it("shows one message for a wrong email or password and stays on the page", async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockRejectedValue(new ApiError("Invalid email or password", 401));
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "sara@example.org");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The email or password is not correct. Check both and try again.");
    expect(api.login).toHaveBeenCalledWith("sara@example.org", "wrong-password");
    expect(screen.getByLabelText("Email")).toHaveValue("sara@example.org");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.queryByText("Dashboard screen")).not.toBeInTheDocument();
  });

  it("says when to wait after too many attempts, and when Raqib cannot be reached", async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockRejectedValueOnce(new ApiError("Too many sign-in attempts", 429)).mockRejectedValueOnce(new Error("Failed to fetch"));
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "sara@example.org");
    await user.type(screen.getByLabelText("Password"), "a-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many sign-in attempts. Wait 15 minutes and try again.");
    await user.type(screen.getByLabelText("Password"), "a-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("We couldn't reach Raqib. Check your connection and try again.")).toBeInTheDocument();
  });

  it("signs in with the email trimmed and opens the dashboard", async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockImplementation(async () => {
      vi.mocked(api.getUser).mockReturnValue(sara);
      vi.mocked(api.getToken).mockReturnValue("token");
      return { accessToken: "token", refreshToken: "refresh", user: sara } satisfies LoginResponse;
    });
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "  sara@example.org ");
    await user.type(screen.getByLabelText("Password"), "olive-grove-2026");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Dashboard screen")).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith("sara@example.org", "olive-grove-2026");
  });

  it("shows the notice after a password reset once: announced, focus on the heading, and cleared from history", async () => {
    renderLogin({ pathname: "/", state: { notice: "passwordReset", lang: "en" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your password has been changed. Sign in with your new password."));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toHaveFocus();
    // A reload or Back reads this history entry again: the notice is gone from it, the language stays.
    await waitFor(() => expect(screen.getByTestId("history-state")).toHaveTextContent('{"lang":"en"}'));
  });

  it("lets the user show the password while typing it (a temporary password is long)", async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveClass("min-h-11", "min-w-11");
    await user.type(password, "Kq7mWx3pZr9TbN4s");
    await user.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(password).toHaveAttribute("type", "password");
  });

  it("sets the page language, direction and title, and gives the language switch 44 px targets", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLogin();
    expect(document.documentElement).toHaveAttribute("lang", "en");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    expect(document.title).toBe("Sign in · Raqib by Momentum Labs");
    const arabic = screen.getByRole("button", { name: "العربية" });
    expect(arabic).toHaveClass("min-h-11", "min-w-11");
    await user.click(arabic);
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.title).toBe("تسجيل الدخول · Raqib by Momentum Labs");
    unmount();
    expect(document.documentElement).not.toHaveAttribute("dir");
  });

  it("switches to Arabic, right to left", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "العربية" }));
    const heading = screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" });
    expect(heading.closest("main")).toHaveAttribute("dir", "rtl");
    expect(heading.closest("main")).toHaveAttribute("lang", "ar");
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");
  });

  it("follows an Arabic browser", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["ar-PS", "en"]);
    renderLogin();
    expect(screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeInTheDocument();
  });
});

describe("Forgot password, email off (the default until the API sends email)", () => {
  it("says reset by email is not available and to ask the admin, instead of promising a link", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeInTheDocument();
    const message = screen.getByText("Password reset by email isn't available yet. Ask your organisation's admin to reset your password in Settings.");
    expect(message.closest("p")).toHaveFocus();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText(/we have sent it a link/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("button", { name: "Forgot password?" })).toHaveFocus();
    expect(api.forgotPassword).not.toHaveBeenCalled();
  });
});

describe("Forgot password, email on", () => {
  beforeEach(() => vi.stubEnv("VITE_EMAIL_ENABLED", "true"));

  async function openForgot() {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "sara@example.org");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    return user;
  }

  it("asks for the email (keeping what was typed), sends the request and answers with the generic message", async () => {
    vi.mocked(api.forgotPassword).mockResolvedValue(undefined);
    const user = await openForgot();
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeInTheDocument();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("sara@example.org");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveFocus();
    expect(screen.getByText("No email? Ask your organisation's admin to reset your password in Settings.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("If an account exists for this email, we have sent it a link to set a new password.");
    expect(api.forgotPassword).toHaveBeenCalledWith("sara@example.org");
    expect(screen.getByRole("button", { name: "Back to sign in" })).toHaveFocus();
  });

  it("gives the same message when the server fails, so it never tells who has an account", async () => {
    vi.mocked(api.forgotPassword).mockRejectedValue(new ApiError("Internal server error", 500));
    const user = await openForgot();
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent("If an account exists for this email, we have sent it a link to set a new password.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("asks to wait after too many requests, needs an email, and goes back to sign in", async () => {
    vi.mocked(api.forgotPassword).mockRejectedValue(new ApiError("Too many sign-in attempts", 429));
    const user = await openForgot();
    await user.clear(screen.getByLabelText("Email"));
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email.");
    expect(api.forgotPassword).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Email"), "sara@example.org");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many sign-in attempts. Wait 15 minutes and try again."));
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toHaveFocus();
  });

  it("opens straight on the form when another screen asks for it", () => {
    vi.unstubAllEnvs();
    renderLogin({ pathname: "/", state: { mode: "forgot", lang: "ar" } });
    expect(screen.getByRole("heading", { level: 1, name: "إعادة تعيين كلمة المرور" })).toBeInTheDocument();
  });
});
