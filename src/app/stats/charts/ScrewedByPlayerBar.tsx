"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface ScrewedByPlayerDatum {
  player: string;
  screwed: number;
}

interface Props {
  data: ScrewedByPlayerDatum[];
  chartTokens: ChartTokens;
  height?: number;
}

export default function ScrewedByPlayerBar({ data, chartTokens, height }: Props) {
  const resolvedHeight = height ?? Math.max(200, data.length * 40);

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <BarChart layout="vertical" data={data} margin={{ left: 60 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={chartTokens.border} />
        <XAxis type="number" tick={{ fontSize: 12, fill: chartTokens.muted }} />
        <YAxis
          type="category"
          dataKey="player"
          tick={{ fontSize: 12, fill: chartTokens.foreground }}
          width={60}
        />
        <Tooltip
          formatter={(value) => [`${Number(value)} screwed`, "Screwed"]}
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
        />
        <Bar dataKey="screwed" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
