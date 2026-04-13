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

interface DeckWinRateDatum {
  deck: string;
  wins: number;
  played: number;
  rate: number;
}

interface Props {
  data: DeckWinRateDatum[];
  chartTokens: ChartTokens;
}

export default function DeckWinRateBar({ data, chartTokens }: Props) {
  const capped = data.length > 20 ? data.slice(0, 20) : data;
  const coloredData = capped.map((d, i) => ({
    ...d,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const height = Math.max(300, capped.length * 28 + 60);

  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart layout="vertical" data={coloredData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={chartTokens.border}
            horizontal={false}
          />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 12, fill: chartTokens.muted }}
            axisLine={{ stroke: chartTokens.border }}
          />
          <YAxis
            type="category"
            dataKey="deck"
            width={120}
            tick={{ fontSize: 12, fill: chartTokens.muted }}
            axisLine={{ stroke: chartTokens.border }}
            tickFormatter={(v: string) =>
              v.length > 16 ? v.slice(0, 16) + "..." : v
            }
          />
          <Bar dataKey="rate" />
          <Tooltip
            formatter={(value, _name, props) => {
              const v = Number(value);
              const p = (props as unknown as { payload: DeckWinRateDatum }).payload;
              return [`${Math.round(v * 100)}% (${p.wins}W / ${p.played}G)`, "Win rate"];
            }}
            contentStyle={{
              background: chartTokens.surface,
              border: `1px solid ${chartTokens.border}`,
              color: chartTokens.foreground,
            }}
            itemStyle={{ color: chartTokens.foreground }}
            labelStyle={{ color: chartTokens.foreground }}
          />
        </BarChart>
      </ResponsiveContainer>
      {data.some((d) => d.deck === 'Other') && (
        <p className="text-xs text-muted mt-2">Showing top 14 decks; remaining grouped as &quot;Other&quot;</p>
      )}
    </>
  );
}
