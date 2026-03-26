import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
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

  const isActive = (path: string) => location.pathname.startsWith(path);

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isActive(item.path)
              ? "bg-primary-light text-primary"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
        >
          <item.icon className="h-[18px] w-[18px]" />
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
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-card border hover:bg-secondary transition-colors"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-foreground/20" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static z-40 top-0 left-0 h-screen w-60 bg-card border-r flex flex-col transition-transform lg:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="p-5 pb-2">
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
