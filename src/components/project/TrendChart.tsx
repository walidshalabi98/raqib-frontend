import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

const colors = ["hsl(var(--success))", "hsl(var(--info))", "hsl(var(--danger))", "hsl(var(--warning))", "hsl(var(--primary))"];

export function TrendChart({ projectId }: { projectId: string }) {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard', projectId],
    queryFn: () => api.getDashboard(projectId),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const trends = (dashboard?.trends || []).filter((t: any) => t.dataPoints?.length > 0).slice(0, 3);

  if (trends.length === 0) {
    return (
      <div className="card-surface p-5">
        <h3 className="text-sm font-semibold mb-4">Indicator Trends</h3>
        <p className="text-sm text-muted-foreground text-center py-8">No trend data available yet.</p>
      </div>
    );
  }

  // Build chart data from available data points
  const allDates = new Set<string>();
  trends.forEach((t: any) => t.dataPoints.forEach((dp: any) => {
    const d = new Date(dp.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    allDates.add(d);
  }));
  const sortedDates = Array.from(allDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const chartData = sortedDates.map(date => {
    const point: any = { date };
    trends.forEach((t: any, i: number) => {
      const dp = t.dataPoints.find((dp: any) =>
        new Date(dp.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) === date
      );
      if (dp) point[`ind${i}`] = parseFloat(dp.value) || 0;
    });
    return point;
  });

  return (
    <div className="card-surface p-5">
      <h3 className="text-sm font-semibold mb-4">Indicator Trends</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 13 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {trends.map((t: any, i: number) => (
            <Line
              key={t.indicatorId}
              type="monotone"
              dataKey={`ind${i}`}
              name={t.indicatorText.slice(0, 30) + (t.indicatorText.length > 30 ? '...' : '')}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
