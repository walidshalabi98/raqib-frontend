import { useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUserLanguage } from "@/i18n/useUserLanguage";
import { LayoutDashboard, FolderKanban, ClipboardCheck, FileText, Settings, Menu, X, Users } from "lucide-react";
import { RaqibLogo } from "@/components/common/RaqibLogo";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Projects", icon: FolderKanban, path: "/projects" },
  { label: "Beneficiaries", icon: Users, path: "/beneficiaries" },
  { label: "Assessments", icon: ClipboardCheck, path: "/assessments" },
  { label: "Reports", icon: FileText, path: "/reports" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function AppSidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const lang = useUserLanguage();
  const { t } = useTranslation(undefined, { lng: lang });
  const sidebarId = useId();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setMobileOpen(false)}
          aria-current={isActive(item.path) ? "page" : undefined}
          // The active link uses the darker primary shade: text-primary on primary-light is 4.4:1, below WCAG AA (4.5:1).
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isActive(item.path)
              ? "bg-primary-light text-primary-hover"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <item.icon aria-hidden="true" className="h-[18px] w-[18px]" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={t(mobileOpen ? "layout.closeMenu" : "layout.openMenu")}
        aria-expanded={mobileOpen}
        aria-controls={sidebarId}
        lang={lang}
        className="lg:hidden fixed top-3 start-3 z-50 p-2 rounded-lg bg-card border hover:bg-secondary transition-colors"
      >
        {mobileOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-foreground/20" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar (logical sides, so it opens from the start side in Arabic too) */}
      <aside id={sidebarId} className={`fixed lg:static z-40 top-0 start-0 h-screen w-60 bg-card border-e flex flex-col transition-transform lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
      }`}>
        {/* Below lg the menu button sits over the top start corner: the logo starts after it. */}
        <div className="p-5 pb-2 ps-16 lg:ps-5">
          <RaqibLogo />
        </div>
        <div className="mt-6 flex-1 overflow-y-auto">
          {nav}
        </div>
        <div className="p-4 border-t">
          <p className="text-[11px] text-muted-foreground">© 2025 Momentum Labs</p>
        </div>
      </aside>
    </>
  );
}
