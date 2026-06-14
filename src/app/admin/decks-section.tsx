"use client";

import { useState, useEffect } from "react";

interface AdminDeck {
  id: string;
  name: string;
  ownerUserId: string | null;
  ownerName: string | null;
  cardCount: number;
  gameCount: number;
}
interface AdminUser { id: string; name: string }

export default function DecksSection() {
  const [decks, setDecks] = useState<AdminDeck[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [dRes, uRes] = await Promise.all([fetch("/api/admin/decks"), fetch("/api/admin/users")]);
        if (dRes.ok) {
          const data = await dRes.json();
          setDecks(Array.isArray(data.decks) ? data.decks : []);
        }
        if (uRes.ok) {
          // GET /api/admin/users returns a bare array (no wrapper object)
          const data = await uRes.json();
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch {
        setStatus("Failed to load decks");
      }
    })();
  }, []);

  const assign = async (deckId: string, ownerUserId: string | null) => {
    setStatus("");
    const res = await fetch(`/api/admin/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerUserId }),
    });
    if (!res.ok) {
      setStatus("Failed to update deck owner");
      return;
    }
    setDecks((ds) =>
      ds.map((d) =>
        d.id === deckId
          ? { ...d, ownerUserId, ownerName: users.find((u) => u.id === ownerUserId)?.name ?? null }
          : d
      )
    );
  };

  const remove = async (deck: AdminDeck) => {
    const msg =
      deck.gameCount > 0
        ? `Delete "${deck.name}"? It is used in ${deck.gameCount} game${deck.gameCount === 1 ? "" : "s"} — deleting removes it from them (player names unchanged).`
        : `Delete "${deck.name}"?`;
    if (!confirm(msg)) return;
    setStatus("");
    const res = await fetch(`/api/admin/decks/${deck.id}`, { method: "DELETE" });
    if (!res.ok) {
      setStatus("Failed to delete deck");
      return;
    }
    setDecks((ds) => ds.filter((d) => d.id !== deck.id));
  };

  return (
    <section className="mt-10">
      <h2 className="text-xl mb-1">Decks</h2>
      <p className="text-sm text-muted mb-4">
        Assign owners to ownerless legacy decks, or fix a wrong assignment.
      </p>
      {status && <p className="text-sm text-red-400 mb-2">{status}</p>}
      {decks.length === 0 ? (
        <p className="text-sm text-muted">No decks yet.</p>
      ) : (
        <div className="space-y-1">
          {decks.map((deck) => (
            <div key={deck.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{deck.name}</span>
                <span className="text-xs text-muted ml-2">{deck.cardCount} cards</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={deck.ownerUserId ?? ""}
                  onChange={(e) => assign(deck.id, e.target.value === "" ? null : e.target.value)}
                  className="px-2 py-1 rounded-md border border-border bg-surface text-foreground text-sm"
                  aria-label={`Owner of ${deck.name}`}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => remove(deck)}
                  className="px-2 py-1 rounded-md text-xs text-red-400 hover:bg-destructive/10 cursor-pointer"
                  aria-label={`Delete ${deck.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
