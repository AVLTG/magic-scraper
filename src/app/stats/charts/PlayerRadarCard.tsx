"use client";

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface PlayerRadarDatum {
  player: string;
  played: number;
  wins: number;
  screwed: number;
  wonByCombo: number;
  nonImportedPlayed: number;
  totalGames: number;
}

interface Props {
  data: PlayerRadarDatum[];
  chartTokens: ChartTokens;
}

const AXES = ["Played", "Wins", "Screwed", "Won by Combo"] as const;
const AXIS_KEYS: Record<(typeof AXES)[number], keyof PlayerRadarDatum> = {
  Played: "played",
  Wins: "wins",
  Screwed: "screwed",
  "Won by Combo": "wonByCombo",
};

export default function PlayerRadarCard({ data, chartTokens }: Props) {
  const radarData = AXES.map((axis) => {
    const row: Record<string, string | number> = { axis };
    for (const d of data) {
      if (axis === "Played") {
        row[d.player] = d.totalGames > 0 ? d.played / d.totalGames : 0;
      } else if (axis === "Won by Combo") {
        row[d.player] = d.nonImportedPlayed > 0 ? d.wonByCombo / d.nonImportedPlayed : 0;
      } else {
        const key = AXIS_KEYS[axis];
        const raw = d[key] as number;
        row[d.player] = d.played > 0 ? raw / d.played : 0;
      }
    }
    return row;
  });

  const rawByPlayer: Record<string, Record<string, number>> = {};
  for (const d of data) {
    rawByPlayer[d.player] = {
      Played: d.played,
      Wins: d.wins,
      Screwed: d.screwed,
      "Won by Combo": d.wonByCombo,
      totalGames: d.totalGames,
      nonImportedPlayed: d.nonImportedPlayed,
    };
  }

  const players = data.map((d) => d.player);

  return (
    <>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={radarData}>
          <PolarGrid gridType="polygon" stroke={chartTokens.border} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 14, fill: chartTokens.foreground }}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          {players.map((player, i) => (
            <Radar
              key={player}
              name={player}
              dataKey={player}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.15}
            />
          ))}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const axis = payload[0]?.payload?.axis as string;
              return (
                <div
                  style={{
                    background: chartTokens.surface,
                    border: `1px solid ${chartTokens.border}`,
                    color: chartTokens.foreground,
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{axis}</div>
                  {payload.map((entry) => {
                    const playerName = entry.name as string;
                    const raw = rawByPlayer[playerName]?.[axis] ?? 0;
                    const played = rawByPlayer[playerName]?.["Played"] ?? 0;
                    const totalGames = rawByPlayer[playerName]?.["totalGames"] ?? 1;
                    const nonImported = rawByPlayer[playerName]?.["nonImportedPlayed"] ?? 0;
                    const pct = axis === "Played"
                      ? Math.round((raw / totalGames) * 100)
                      : axis === "Won by Combo"
                      ? nonImported > 0 ? Math.round((raw / nonImported) * 100) : 0
                      : played > 0 ? Math.round((raw / played) * 100) : 0;
                    return (
                      <div
                        key={playerName}
                        style={{ color: entry.color, marginBottom: 2 }}
                      >
                        {playerName}: {raw} ({pct}%)
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-foreground">
        {players.map((player, i) => (
          <span key={player} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              aria-hidden="true"
            />
            {player}
          </span>
        ))}
      </div>
    </>
  );
}
