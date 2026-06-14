"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";

interface DeckCardRow {
  cardName: string;
  quantity: number;
  set: string | null;
  collectorNumber: string | null;
  isFoil: boolean;
  inLibrary: boolean;
}
interface DeckDetail {
  id: string;
  name: string;
  ownerName: string | null;
  isOwner: boolean;
  cards: DeckCardRow[];
}
interface LibraryCard { id: string; cardName: string; set: string; isFoil: boolean }

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [library, setLibrary] = useState<LibraryCard[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMissing, setImportMissing] = useState<{ cardName: string }[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const loadDeck = useCallback(async () => {
    const res = await fetch(`/api/decks/${id}`);
    if (!res.ok) {
      setError(res.status === 404 ? "Deck not found" : "Failed to load deck");
      return;
    }
    const data = await res.json();
    setDeck(data.deck);
  }, [id]);

  useEffect(() => { loadDeck(); }, [loadDeck]);

  useEffect(() => {
    if (!deck?.isOwner) return;
    (async () => {
      const res = await fetch("/api/library");
      if (res.ok) {
        const data = await res.json();
        setLibrary(Array.isArray(data.cards) ? data.cards : []);
      }
    })();
  }, [deck?.isOwner]);

  const mutateCards = async (body: Record<string, unknown>) => {
    setError("");
    const res = await fetch(`/api/decks/${id}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(typeof data.error === "string" ? data.error : "Update failed");
      return;
    }
    await loadDeck();
  };

  const renameDeck = async () => {
    const next = nameDraft.trim();
    if (!next || next === deck?.name) { setEditingName(false); return; }
    setError("");
    const res = await fetch(`/api/decks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to rename deck");
      return;
    }
    setEditingName(false);
    await loadDeck();
  };

  const runImport = async (body: Record<string, unknown>) => {
    setImportBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/decks/${id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importText, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(data.cards) ? `: ${data.cards.join(", ")}` : "";
        setError(`${typeof data.error === "string" ? data.error : "Import failed"}${detail}`);
        return;
      }
      if (body.dryRun) {
        if (Array.isArray(data.missing) && data.missing.length > 0) setImportMissing(data.missing);
        else await runImport({ dryRun: false, addMissingToLibrary: false });
        return;
      }
      setShowImport(false); setImportText(""); setImportMissing(null);
      await loadDeck();
    } finally {
      setImportBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete deck "${deck?.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/decks");
    else setError("Failed to delete deck");
  };

  if (error && !deck) return <div className="py-8 text-red-400">{error}</div>;
  if (!deck) return <div className="py-8 text-muted">Loading…</div>;

  const inDeck = new Set(deck.cards.map((c) => c.cardName.toLowerCase()));
  const addable = library.filter(
    (c) =>
      !inDeck.has(c.cardName.toLowerCase()) &&
      (search.trim() === "" || c.cardName.toLowerCase().includes(search.trim().toLowerCase()))
  );
  // dedupe printings by name for the picker
  const seen = new Set<string>();
  const addableUnique = addable.filter((c) => {
    const k = c.cardName.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-2">
        {deck.isOwner && editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); renameDeck(); }
              if (e.key === "Escape") setEditingName(false);
            }}
            onBlur={renameDeck}
            maxLength={100}
            className="text-3xl bg-background border border-accent rounded px-2 py-0.5 text-foreground"
          />
        ) : (
          <h1
            className={`text-3xl ${deck.isOwner ? "cursor-pointer hover:text-accent" : ""}`}
            onClick={() => { if (deck.isOwner) { setNameDraft(deck.name); setEditingName(true); } }}
            title={deck.isOwner ? "Click to rename" : undefined}
          >
            {deck.name}
          </h1>
        )}
        {deck.isOwner && (
          <button onClick={handleDelete} className="text-sm text-red-400 hover:text-red-300 cursor-pointer">
            Delete deck
          </button>
        )}
      </div>
      <p className="text-muted mb-6">
        {deck.isOwner ? "Your deck" : deck.ownerName ? `Owned by ${deck.ownerName}` : "Ownerless deck"} ·{" "}
        {deck.cards.reduce((n, c) => n + c.quantity, 0)} cards
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {deck.cards.length === 0 ? (
        <p className="text-muted text-sm mb-8">No cards yet{deck.isOwner ? " — add some from your library below." : "."}</p>
      ) : (
        <div className="space-y-1 mb-8">
          {deck.cards.map((c) => (
            <div key={c.cardName} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{c.cardName}</span>
                {c.set && <span className="text-xs text-muted">({c.set.toUpperCase()})</span>}
                {c.isFoil && (
                  <span className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">Foil</span>
                )}
                {!c.inLibrary && (
                  <span className="text-xs bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded" title="Not in the owner's library">
                    not in library
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {deck.isOwner ? (
                  <>
                    <button
                      onClick={() => mutateCards({ setQuantity: [{ cardName: c.cardName, quantity: c.quantity - 1 }] })}
                      className="w-6 h-6 rounded border border-border text-muted hover:text-foreground cursor-pointer"
                      aria-label={`Decrease ${c.cardName}`}
                    >
                      −
                    </button>
                    <span className="font-mono text-xs w-6 text-center">x{c.quantity}</span>
                    <button
                      onClick={() => mutateCards({ setQuantity: [{ cardName: c.cardName, quantity: c.quantity + 1 }] })}
                      className="w-6 h-6 rounded border border-border text-muted hover:text-foreground cursor-pointer"
                      aria-label={`Increase ${c.cardName}`}
                    >
                      +
                    </button>
                    <button
                      onClick={() => mutateCards({ remove: [c.cardName] })}
                      className="ml-2 text-xs text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="font-mono text-xs">x{c.quantity}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deck.isOwner && (
        <div className="rounded-lg border border-border bg-surface p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg">Moxfield Import</h2>
            <button onClick={() => setShowImport((v) => !v)} className="text-sm text-accent hover:underline cursor-pointer">
              {showImport ? "Cancel" : "Paste a list"}
            </button>
          </div>
          {showImport && (
            <div className="space-y-3">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"1 Sol Ring (C21) 263\n2 Treasure Vault (AFR) 261 *F*"}
                className="w-full h-40 p-3 rounded-md border border-border bg-background text-foreground font-mono text-sm"
              />
              {importMissing === null ? (
                <button
                  onClick={() => runImport({ dryRun: true })}
                  disabled={importBusy || importText.trim().length === 0}
                  className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                >
                  {importBusy ? "Checking…" : "Import"}
                </button>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-amber-400 font-medium">
                    {importMissing.length} card{importMissing.length !== 1 ? "s are" : " is"} not in your library:
                  </p>
                  <pre className="text-xs text-foreground/80 max-h-40 overflow-auto whitespace-pre-wrap">
                    {importMissing.map((m) => m.cardName).join("\n")}
                  </pre>
                  <div className="flex gap-2">
                    <button onClick={() => runImport({ dryRun: false, addMissingToLibrary: true })} disabled={importBusy} className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer">
                      Yes — add to library
                    </button>
                    <button onClick={() => runImport({ dryRun: false, addMissingToLibrary: false })} disabled={importBusy} className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover disabled:opacity-50 cursor-pointer">
                      No — import without them
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {deck.isOwner && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-lg mb-3">Add from your library</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library…"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground mb-3"
          />
          <div className="max-h-72 overflow-auto space-y-1">
            {addableUnique.slice(0, 50).map((c) => (
              <button
                key={c.id}
                onClick={() => mutateCards({ add: [{ cardName: c.cardName, quantity: 1, set: c.set, isFoil: c.isFoil }] })}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-surface-hover transition-colors cursor-pointer"
              >
                + {c.cardName}
              </button>
            ))}
            {addableUnique.length === 0 && <p className="text-sm text-muted px-3 py-2">No matching library cards.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
