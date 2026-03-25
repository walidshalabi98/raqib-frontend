import { useState } from "react";
import { mockOrg, mockUsers } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload } from "lucide-react";

export default function SettingsPage() {
  const [orgName, setOrgName] = useState(mockOrg.name);

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      {/* Organization */}
      <section className="card-surface p-6 space-y-4">
        <h2 className="text-base font-semibold">Organization</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Organization Name</Label>
            <Input value={orgName} onChange={e => setOrgName(e.target.value)} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Email</Label>
            <Input value={mockOrg.contact_email} readOnly className="rounded-lg" />
          </div>
        </div>
        <div>
          <Label>Logo</Label>
          <div className="mt-1.5 card-surface border-dashed border-2 p-4 text-center">
            <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Click to upload logo</p>
          </div>
        </div>
        <Button size="sm">Save Changes</Button>
      </section>

      {/* Users */}
      <section className="card-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Team Members</h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Invite User</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input placeholder="user@example.com" className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select defaultValue="me_officer">
                    <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org_admin">Admin</SelectItem>
                      <SelectItem value="me_officer">M&E Officer</SelectItem>
                      <SelectItem value="donor_viewer">Donor Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full">Send Invitation</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="card-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mockUsers.map(u => (
                <tr key={u.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-secondary text-secondary-foreground capitalize">
                      {u.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Notifications */}
      <section className="card-surface p-6 space-y-4">
        <h2 className="text-base font-semibold">Notification Preferences</h2>
        <div className="space-y-3">
          {[
            { label: "Indicator off-track alerts", key: "off_track" },
            { label: "Assessment status updates", key: "assessment" },
            { label: "Report generation notifications", key: "report" },
            { label: "Team activity digest", key: "digest" },
          ].map(n => (
            <div key={n.key} className="flex items-center justify-between py-2">
              <span className="text-sm">{n.label}</span>
              <Switch defaultChecked />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
