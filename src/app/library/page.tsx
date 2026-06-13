"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface LibraryCard {
  id: string;
  cardName: string;
  set: string;
  setName: string;
  quantity: number;
  condition: string;
  isFoil: boolean;
  typeLine: string;
  source: string;
  decks: { id: string; name: string }[];
}
interface AddError { line: number; raw: string; reason: string }

const TYPE_FILTERS = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"];

export default function LibraryPage() {
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [isLegacyAdmin, setIsLegacyAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [foilFilter, setFoilFilter] = useState("");      // "" | "foil" | "nonfoil"
  const [sourceFilter, setSourceFilter] = useState("");  // "" | "moxfield" | "manual"
  const [typeFilter, setTypeFilter] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState("");
  const [addErrors, setAddErrors] = useState<AddError[]>([]);
  const [addStatus, setAddStatus] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const loadCards = async () => {
    try {
      const res = await fetch("/api/library");
      if (!res.ok) throw new Error("Failed to load library");
      const data = await res.json();
      setCards(Array.isArray(data.cards) ? data.cards : []);
      setIsLegacyAdmin(Boolean(data.isLegacyAdmin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadCards(); }, []);

  const handleAdd = async () => {
    setIsAdding(true);
    setAddStatus("");
    setAddErrors([]);
    try {
      const res = await fetch("/api/library/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: addText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddStatus(typeof data.error === "string" ? data.error : "Failed to add cards");
        return;
      }
      setAddErrors(Array.isArray(data.errors) ? data.errors : []);
      setAddStatus(`Added ${data.added.length} card${data.added.length !== 1 ? "s" : ""}.`);
      if (data.added.length > 0) {
        setAddText("");
        await loadCards();
      }
    } finally {
      setIsAdding(false);
    }
  };

  const sets = Array.from(new Set(cards.map((c) => c.setName))).sort();
  const q = search.trim().toLowerCase();
  const filtered = cards.filter((c) => {
    if (q && !c.cardName.toLowerCase().includes(q)) return false;
    if (setFilter && c.setName !== setFilter) return false;
    if (foilFilter === "foil" && !c.isFoil) return false;
    if (foilFilter === "nonfoil" && c.isFoil) return false;
    if (sourceFilter && c.source !== sourceFilter) return false;
    if (typeFilter && !c.typeLine.includes(typeFilter)) return false;
    return true;
  });

  if (isLoading) return <div className="py-8 text-muted">Loading…</div>;

  if (isLegacyAdmin) {
    return (
      <div className="py-8">
        <h1 className="text-3xl mb-4">Card Library</h1>
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          The bootstrap admin has no library — create your account via an invite first.
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl">Card Library</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-surface transition-colors cursor-pointer"
        >
          {showAdd ? "Close" : "Add cards"}
        </button>
      </div>
      <p className="text-muted mb-6">{cards.length} cards · {filtered.length} shown</p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {showAdd && (
        <div className="rounded-lg border border-border bg-surface p-4 mb-6 space-y-3">
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder={"Moxfield format, one card per line:\n1 Treasure Vault (AFR) 261 *F*"}
            className="w-full h-36 p-3 rounded-md border border-border bg-background text-foreground font-mono text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={isAdding || addText.trim().length === 0}
            className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
          >
            {isAdding ? "Adding…" : "Add to library"}
          </button>
          {addStatus && <p className="text-sm text-foreground/80">{addStatus}</p>}
          {addErrors.length > 0 && (
            <div className="text-xs text-amber-400">
              {addErrors.map((e) => (
                <p key={`${e.line}-${e.raw}`}>Line {e.line}: {e.reason} — &quot;{e.raw}&quot;</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards…"
          className="flex-1 min-w-48 px-3 py-2 rounded-md border border-border bg-surface text-foreground"
        />
        <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by set">
          <option value="">All sets</option>
          {sets.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by type">
          <option value="">All types</option>
          {TYPE_FILTERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={foilFilter} onChange={(e) => setFoilFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by foil">
          <option value="">Foil + non-foil</option>
          <option value="foil">Foil only</option>
          <option value="nonfoil">Non-foil only</option>
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-2 py-2 rounded-md border border-border bg-surface text-foreground text-sm" aria-label="Filter by source">
          <option value="">All sources</option>
          <option value="moxfield">Moxfield</option>
          <option value="manual">Manually added</option>
        </select>
      </div>

      <div className="space-y-1">
        {filtered.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate">{c.cardName}</span>
              <span className="text-xs text-muted">({c.set.toUpperCase()})</span>
              <span className="bg-surface text-muted px-1.5 py-0.5 rounded text-xs font-mono">x{c.quantity}</span>
              {c.isFoil && (
                <span className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">Foil</span>
              )}
              {c.source === "manual" && (
                <span className="text-xs bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded font-medium">Manual</span>
              )}
            </div>
            {c.decks.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.decks.map((d) => (
                  <Link
                    key={d.id}
                    href={`/decks/${d.id}`}
                    className="text-xs bg-accent-muted text-accent px-1.5 py-0.5 rounded hover:underline"
                  >
                    {d.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-muted text-sm">No cards match the current filters.</p>}
      </div>
    </div>
  );
}
