import { useState } from "react";
import { Bell, ChevronDown, LogOut, User, Settings } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { mockOrg, mockUsers, mockNotifications } from "@/data/mockData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TopBar() {
  const navigate = useNavigate();
  const user = mockUsers[0];
  const unreadCount = mockNotifications.filter(n => !n.is_read).length;
  const [notifications, setNotifications] = useState(mockNotifications);

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 lg:px-6">
      <div className="lg:hidden w-10" />
      <p className="text-sm text-muted-foreground hidden md:block">{mockOrg.name}</p>
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
              <Bell className="h-[18px] w-[18px] text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0 -right-0 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h4 className="text-sm font-semibold">Notifications</h4>
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all as read</button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 border-b last:border-0 hover:bg-secondary/50 cursor-pointer ${!n.is_read ? "bg-primary-light/50" : ""}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${n.type === "off_track_alert" ? "bg-danger" : n.type === "assessment_ready" ? "bg-info" : "bg-success"}`} />
                    <div>
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              WH
            </div>
            <span className="text-sm font-medium hidden md:block">{user.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem><User className="h-4 w-4 mr-2" /> Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="h-4 w-4 mr-2" /> Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/")}><LogOut className="h-4 w-4 mr-2" /> Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
