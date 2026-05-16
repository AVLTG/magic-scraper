"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Legend,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface GamesByDeckDatum {
  deck: string;
  games: number;
}

interface Props {
  data: GamesByDeckDatum[];
  chartTokens: ChartTokens;
  height?: number;
}

export default function GamesByDeckPie({ data, chartTokens, height }: Props) {
  const capped = data.length > 20 ? data.slice(0, 20) : data;
  const coloredData = capped.map((d, i) => ({
    ...d,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const total = capped.reduce((s, d) => s + d.games, 0);
  const resolvedHeight = height ?? 320;

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <PieChart>
        <Pie
          data={coloredData}
          dataKey="games"
          nameKey="deck"
          cx="50%"
          cy="50%"
          outerRadius={120}
        />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value);
            return [`${v} games (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, String(name)];
          }}
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
        />
        <Legend
          iconType="circle"
          formatter={(value: string) => (
            <span style={{ color: chartTokens.muted }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
