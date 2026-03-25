import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const data = [
  { month: "Jul", ind1: 12, ind7: 0, ind8: 0 },
  { month: "Aug", ind1: 16, ind7: 85, ind8: 22 },
  { month: "Sep", ind1: 19, ind7: 210, ind8: 28 },
  { month: "Oct", ind1: 22, ind7: 390, ind8: 32 },
  { month: "Nov", ind1: 25, ind7: 560, ind8: 35 },
  { month: "Dec", ind1: 28, ind7: 743, ind8: 38 },
];

export function TrendChart() {
  return (
    <div className="card-surface p-5">
      <h3 className="text-sm font-semibold mb-4">Indicator Trends</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 13 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="ind1" name="% HH income increase" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="ind7" name="# completed training" stroke="hsl(var(--info))" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="ind8" name="% women beneficiaries" stroke="hsl(var(--danger))" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
