"use client";

import { useState, useEffect, useCallback } from "react";

interface UnlinkedEntry { name: string; gameCount: number }
interface AdminDeck { id: string; name: string; ownerName: string | null }

export default function UnlinkedDecksSection() {
  const [items, setItems] = useState<UnlinkedEntry[]>([]);
  const [decks, setDecks] = useState<AdminDeck[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const loadReconcile = useCallback(async () => {
    const res = await fetch("/api/admin/reconcile");
    if (res.ok) {
      const data = await res.json();
      setItems(Array.isArray(data.unlinkedDecks) ? data.unlinkedDecks : []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const dRes = await fetch("/api/admin/decks");
        if (dRes.ok) {
          const d = await dRes.json();
          setDecks(Array.isArray(d.decks) ? d.decks : []);
        }
        await loadReconcile();
      } catch {
        setStatus("Failed to load reconciliation data");
      }
    })();
  }, [loadReconcile]);

  const post = async (body: object) => {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/reconcile/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setStatus(e.error || "Action failed");
        return;
      }
      await loadReconcile();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surface p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold">Unlinked game decks</h2>
        <button
          onClick={() => post({ action: "createAll" })}
          disabled={busy || items.length === 0}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Add all as decks
        </button>
      </div>
      <p className="text-sm text-muted mb-4">
        Deck names from game history with no matching deck. Linking renames history to the deck&apos;s name; creating
        makes an unassigned deck you can assign an owner to below.
      </p>
      {status && <p className="text-sm text-red-400 mb-2">{status}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing to reconcile.</p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div
              key={it.name}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">{it.name}</span>
                <span className="text-xs text-muted ml-2">
                  {it.gameCount} game{it.gameCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.value) post({ action: "link", name: it.name, targetDeckId: e.target.value });
                  }}
                  className="px-2 py-1 rounded-md border border-border bg-surface text-foreground text-sm"
                  aria-label={`Link ${it.name} to a deck`}
                >
                  <option value="">Link to deck…</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.ownerName ?? "Unassigned"}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => post({ action: "create", name: it.name })}
                  disabled={busy}
                  className="px-3 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
