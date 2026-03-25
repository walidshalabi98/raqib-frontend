import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export function Sparkline({ data, color = "hsl(var(--success))" }: { data: number[]; color?: string }) {
  const chartData = data.map((v, i) => ({ v, i }));
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={chartData}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
