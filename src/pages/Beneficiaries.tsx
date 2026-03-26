import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Users, UserPlus, Search, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const GENDER_COLORS: Record<string, string> = { male: "#3b82f6", female: "#ec4899", other: "#8b5cf6" };
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  dropped_out: "bg-red-100 text-red-700",
  referred: "bg-amber-100 text-amber-700",
};

export default function Beneficiaries() {
  const [selectedProject, setSelectedProject] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    fullName: "", fullNameAr: "", gender: "male", age: "", ageGroup: "",
    location: "", governorate: "", phoneNumber: "", nationalId: "", householdSize: "",
  });
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.getProjects(),
  });

  const { data: benefData, isLoading } = useQuery({
    queryKey: ["beneficiaries", selectedProject],
    queryFn: () => api.getBeneficiaries(selectedProject),
    enabled: !!selectedProject,
  });

  const beneficiaries = benefData?.beneficiaries || [];
  const summary = benefData?.summary || {};

  const filtered = beneficiaries.filter((b: any) =>
    !search || b.fullName.toLowerCase().includes(search.toLowerCase()) ||
    b.fullNameAr?.toLowerCase().includes(search.toLowerCase()) ||
    b.governorate?.toLowerCase().includes(search.toLowerCase())
  );

  const genderPieData = (summary.byGender || []).map((g: any) => ({
    name: g.gender, value: g._count, color: GENDER_COLORS[g.gender] || "#6b7280",
  }));

  const handleCreate = async () => {
    if (!form.fullName || !form.gender || !selectedProject) {
      toast.error("Name, gender, and project are required");
      return;
    }
    setCreating(true);
    try {
      await api.createBeneficiary(selectedProject, {
        ...form,
        age: form.age ? parseInt(form.age) : undefined,
        householdSize: form.householdSize ? parseInt(form.householdSize) : undefined,
        ageGroup: form.ageGroup || undefined,
      });
      toast.success("Beneficiary registered!");
      queryClient.invalidateQueries({ queryKey: ["beneficiaries", selectedProject] });
      setAddOpen(false);
      setForm({ fullName: "", fullNameAr: "", gender: "male", age: "", ageGroup: "", location: "", governorate: "", phoneNumber: "", nationalId: "", householdSize: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to register");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Beneficiaries</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button disabled={!selectedProject}><UserPlus className="mr-2 h-4 w-4" /> Register Beneficiary</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Register New Beneficiary</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <Input placeholder="Full Name *" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
              <Input placeholder="Full Name (Arabic)" value={form.fullNameAr} onChange={e => setForm({ ...form, fullNameAr: e.target.value })} />
              <Select value={form.gender} onValueChange={v => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Gender *" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Age" type="number" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} />
              <Select value={form.ageGroup} onValueChange={v => setForm({ ...form, ageGroup: v })}>
                <SelectTrigger><SelectValue placeholder="Age Group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="child_0_5">Child (0-5)</SelectItem>
                  <SelectItem value="child_6_11">Child (6-11)</SelectItem>
                  <SelectItem value="adolescent_12_17">Adolescent (12-17)</SelectItem>
                  <SelectItem value="youth_18_24">Youth (18-24)</SelectItem>
                  <SelectItem value="adult_25_59">Adult (25-59)</SelectItem>
                  <SelectItem value="elderly_60_plus">Elderly (60+)</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              <Input placeholder="Governorate" value={form.governorate} onChange={e => setForm({ ...form, governorate: e.target.value })} />
              <Input placeholder="Phone Number" value={form.phoneNumber} onChange={e => setForm({ ...form, phoneNumber: e.target.value })} />
              <Input placeholder="National ID" value={form.nationalId} onChange={e => setForm({ ...form, nationalId: e.target.value })} />
              <Input placeholder="Household Size" type="number" value={form.householdSize} onChange={e => setForm({ ...form, householdSize: e.target.value })} />
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Register
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Project Selector */}
      <div className="flex gap-4 items-center">
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select Project" /></SelectTrigger>
          <SelectContent>
            {projects.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedProject && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search beneficiaries..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {!selectedProject ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Select a project to view beneficiaries</CardContent></Card>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold">{summary.total || 0}</p>
              <p className="text-sm text-muted-foreground">Total Beneficiaries</p>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-600">{summary.active || 0}</p>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent></Card>
            <Card className="col-span-2"><CardContent className="pt-4">
              {genderPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={genderPieData} cx="50%" cy="50%" outerRadius={45} dataKey="value">
                      {genderPieData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-sm text-muted-foreground py-4">No gender data</p>}
            </CardContent></Card>
          </div>

          {/* Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Governorate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No beneficiaries found</TableCell></TableRow>
                ) : filtered.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.fullName}{b.fullNameAr && <span className="text-xs text-muted-foreground ml-1">({b.fullNameAr})</span>}</TableCell>
                    <TableCell className="capitalize">{b.gender}</TableCell>
                    <TableCell>{b.age || "-"}</TableCell>
                    <TableCell>{b.governorate || "-"}</TableCell>
                    <TableCell><Badge className={`text-xs ${STATUS_COLORS[b.status] || ""}`}>{b.status}</Badge></TableCell>
                    <TableCell>{b.services?.length || 0}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(b.registrationDate).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
