import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AuthProvider } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { renderWithClient } from "@/test/utils";
import type { AuthUser } from "@/types/api";

vi.mock("@/services/api", () => ({
  api: {
    getNotifications: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    getUser: vi.fn(() => null),
    getToken: vi.fn(() => "token"),
  },
}));

function renderLayout(ui: JSX.Element, languagePref = "en", path = "/projects") {
  const user: AuthUser = { id: "u1", email: "u@example.org", fullName: "Sara Haddad", role: "donor_viewer", languagePref, organization: { id: "org-1", name: "Org" } };
  vi.mocked(api.getUser).mockReturnValue(user);
  return renderWithClient(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getNotifications).mockResolvedValue([]);
});

describe("layout icon buttons have names (axe button-name, WCAG 4.1.2)", () => {
  it("names the notifications button, with the unread count", async () => {
    vi.mocked(api.getNotifications).mockResolvedValue([
      { id: "n-1", title: "A", message: "", isRead: false, createdAt: "2026-10-13T08:00:00.000Z" },
      { id: "n-2", title: "B", message: "", isRead: false, createdAt: "2026-10-13T08:00:00.000Z" },
    ]);
    renderLayout(<TopBar />);
    expect(await screen.findByRole("button", { name: "Notifications: 2 unread" })).toBeInTheDocument();
  });

  it("names it in Arabic", async () => {
    renderLayout(<TopBar />, "ar");
    const bell = await screen.findByRole("button", { name: "الإشعارات" });
    expect(bell).toHaveAttribute("lang", "ar");
  });

  it("names the mobile menu button and says whether the menu is open", async () => {
    const user = userEvent.setup({ delay: null });
    renderLayout(<AppSidebar />);
    const menu = screen.getByRole("button", { name: "Open the navigation menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    await user.click(menu);
    const close = screen.getByRole("button", { name: "Close the navigation menu" });
    expect(close).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(close.getAttribute("aria-controls") ?? "")?.tagName).toBe("ASIDE");
  });

  it("names the account menu in full, also on phones where only the initials show", async () => {
    renderLayout(<TopBar />);
    expect(await screen.findByRole("button", { name: "Account menu: Sara Haddad" })).toBeInTheDocument();
    renderLayout(<TopBar />, "ar");
    const ar = await screen.findByRole("button", { name: "قائمة الحساب: Sara Haddad" });
    expect(ar).toHaveAttribute("lang", "ar");
  });

  it("uses logical sides, so the menu opens from the start side in Arabic, and keeps the logo clear of the menu button", () => {
    renderLayout(<AppSidebar />);
    const aside = document.querySelector("aside")!;
    expect(aside.className).toMatch(/\bstart-0\b/);
    expect(aside.className).toMatch(/\bborder-e\b/);
    expect(aside.className).toContain("rtl:translate-x-full");
    expect(aside.className).not.toMatch(/\b(left-0|border-r)\b/);
    expect(screen.getByRole("button", { name: "Open the navigation menu" }).className).toMatch(/\bstart-3\b/);
    expect(aside.firstElementChild?.className).toContain("ps-16");
  });

  it("marks the current page in the sidebar, not by colour alone", () => {
    renderLayout(<AppSidebar />, "ar", "/beneficiaries");
    expect(screen.getByRole("button", { name: "فتح قائمة التنقل" })).toBeInTheDocument();
    const current = screen.getByRole("link", { current: "page" });
    expect(current).toHaveTextContent("Beneficiaries");
    expect(current.className).toContain("text-primary-hover");
  });
});
