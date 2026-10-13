import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { AppRoutes, PublicFallback, UserToaster } from "@/App";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";

vi.mock("@/services/api", () => ({
  api: {
    login: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => null),
    logout: vi.fn(),
  },
}));

function renderAt(path: string) {
  return renderWithClient(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getUser).mockReturnValue(null);
  vi.mocked(api.getToken).mockReturnValue(null);
});

describe("routes before sign-in", () => {
  it("serves sign-in at / and sends /login (older invitation emails) there", async () => {
    renderAt("/login");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });

  it("opens the reset page without signing in", async () => {
    renderAt("/reset-password?token=abc.def.ghi");
    expect(await screen.findByRole("heading", { level: 1, name: "Set a new password" })).toBeInTheDocument();
  });

  it("sends signed-out visitors of a signed-in page to sign in", async () => {
    renderAt("/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  });
});

describe("while a sign-in screen loads", () => {
  it("shows the card with the logo and placeholder lines instead of a blank page", () => {
    render(<PublicFallback />);
    const card = screen.getByTestId("public-fallback");
    expect(card).toHaveTextContent("Raqib");
    expect(card.closest("main")).toHaveAttribute("aria-busy", "true");
    expect(card.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(3);
  });
});

describe("toasts", () => {
  it.each([
    ["ar", "rtl"],
    ["en", "ltr"],
  ])("follow the signed-in user's language (%s: %s)", async (languagePref, dir) => {
    vi.mocked(api.getUser).mockReturnValue({ id: "u-1", email: "x@example.org", fullName: "X", role: "me_officer", languagePref, organization: { id: "org-1", name: "Org" } });
    vi.mocked(api.getToken).mockReturnValue("token");
    const { unmount } = render(
      <AuthProvider>
        <UserToaster />
      </AuthProvider>,
    );
    act(() => {
      toast.success("تم تغيير كلمة المرور.");
    });
    await waitFor(() => expect(document.querySelector("[data-sonner-toaster]")).toHaveAttribute("dir", dir));
    unmount();
  });
});
