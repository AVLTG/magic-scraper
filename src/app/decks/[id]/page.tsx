"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { groupDeckByType, computeDeckStats } from "@/lib/deckGroups";

interface DeckCardRow {
  cardName: string;
  quantity: number;
  set: string | null;
  collectorNumber: string | null;
  isFoil: boolean;
  board: string;
  typeLine: string | null;
  scryfallId: string | null;
  inLibrary: boolean;
}
interface DeckDetail {
  id: string;
  name: string;
  format: string | null;
  commander: string | null;
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
  const [importBoard, setImportBoard] = useState("main");
  const [importMissing, setImportMissing] = useState<{ cardName: string }[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [formatDraft, setFormatDraft] = useState("");
  const [commanderDraft, setCommanderDraft] = useState("");
  // Compact grid: controls live behind a click. One expanded card at a time.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const cardKey = (c: DeckCardRow) => `${c.board}:${c.cardName}`;

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
        body: JSON.stringify({ text: importText, board: importBoard, ...body }),
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

  const saveMeta = async () => {
    setError("");
    const res = await fetch(`/api/decks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: formatDraft.trim() ? formatDraft.trim() : null,
        commander: commanderDraft.trim() ? commanderDraft.trim() : null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to save details");
      return;
    }
    setEditingMeta(false);
    await loadDeck();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete deck "${deck?.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/decks");
    else setError("Failed to delete deck");
  };

  if (error && !deck) return <div className="py-8 text-red-400">{error}</div>;
  if (!deck) return <div className="py-8 text-muted">Loading…</div>;

  const mainCards = deck.cards.filter((c) => c.board !== "side" && c.board !== "maybe");
  const sideCards = deck.cards.filter((c) => c.board === "side");
  const maybeCards = deck.cards.filter((c) => c.board === "maybe");
  const groups = groupDeckByType(mainCards);
  const stats = computeDeckStats(mainCards);
  const libraryPct = stats.total > 0 ? Math.round((stats.inLibraryCount / stats.total) * 100) : 0;

  const renderRows = (cards: DeckCardRow[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
      {cards.map((c) => {
        const key = cardKey(c);
        const expanded = expandedKey === key;
        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            aria-label={`${c.cardName}, quantity ${c.quantity}. Activate to ${expanded ? "collapse" : "adjust quantity"}.`}
            onClick={() => setExpandedKey(expanded ? null : key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setExpandedKey(expanded ? null : key);
              }
            }}
            className={`group rounded-md border px-2.5 py-1.5 text-sm cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-accent ${expanded ? "border-accent/60 bg-surface" : "border-border hover:border-accent/40"}`}
          >
            {c.scryfallId && (
              <div className="hidden md:group-hover:block fixed z-[9999] pointer-events-none">
                <img
                  src={`https://api.scryfall.com/cards/${c.scryfallId}?format=image`}
                  alt={c.cardName}
                  loading="lazy"
                  className="w-64 rounded-lg shadow-2xl border border-border"
                  style={{ position: 'fixed', right: '20px', bottom: '20px' }}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="font-medium truncate">
                {c.cardName}
                {c.set && <span className="text-xs text-muted font-normal"> ({c.set.toUpperCase()})</span>}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {c.isFoil && (
                  <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1 py-px rounded font-medium">Foil</span>
                )}
                {!c.inLibrary && (
                  <span className="text-[10px] bg-red-500/15 text-red-400 px-1 py-px rounded" title="Not in the owner's library" aria-label="Not in the owner's library">
                    <span aria-hidden="true">!</span>
                  </span>
                )}
                <span className="font-mono text-xs text-muted">x{c.quantity}</span>
              </span>
            </div>
            {expanded && deck.isOwner && (
              <div
                className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-border"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => mutateCards({ setQuantity: [{ cardName: c.cardName, quantity: c.quantity - 1, board: c.board }] })}
                  className="w-6 h-6 rounded border border-border text-muted hover:text-foreground cursor-pointer"
                  aria-label={`Decrease ${c.cardName}`}
                >
                  −
                </button>
                <button
                  onClick={() => mutateCards({ setQuantity: [{ cardName: c.cardName, quantity: c.quantity + 1, board: c.board }] })}
                  className="w-6 h-6 rounded border border-border text-muted hover:text-foreground cursor-pointer"
                  aria-label={`Increase ${c.cardName}`}
                >
                  +
                </button>
                <button
                  onClick={() => mutateCards({ remove: [{ cardName: c.cardName, board: c.board }] })}
                  className="ml-auto text-xs text-red-400 hover:text-red-300 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}
            {expanded && !deck.isOwner && (
              <p className="text-xs text-muted pt-1 mt-1 border-t border-border">
                {!c.inLibrary ? "Not in the owner's library." : c.typeLine ?? ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

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
      <p className="text-muted mb-2">
        {deck.isOwner ? "Your deck" : deck.ownerName ? `Owned by ${deck.ownerName}` : "Ownerless deck"} ·{" "}
        {stats.total} cards
        {sideCards.length > 0 && ` · ${sideCards.reduce((n, c) => n + c.quantity, 0)} sideboard`}
        {maybeCards.length > 0 && ` · ${maybeCards.reduce((n, c) => n + c.quantity, 0)} maybeboard`}
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {deck.format && (
          <span className="text-xs font-medium bg-sky-500/15 text-sky-400 px-2 py-0.5 rounded-full">{deck.format}</span>
        )}
        {deck.commander && (
          <span className="text-xs font-medium bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full" title="Commander">
            {deck.commander}
          </span>
        )}
        {deck.isOwner && (
          <button
            onClick={() => {
              setFormatDraft(deck.format ?? "");
              setCommanderDraft(deck.commander ?? "");
              setEditingMeta((v) => !v);
            }}
            className="text-xs text-accent hover:underline cursor-pointer"
          >
            {editingMeta ? "Cancel" : deck.format || deck.commander ? "Edit details" : "Add format / commander"}
          </button>
        )}
      </div>

      {deck.isOwner && editingMeta && (
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            type="text"
            value={formatDraft}
            onChange={(e) => setFormatDraft(e.target.value)}
            placeholder="Format (e.g. Commander)"
            maxLength={50}
            className="flex-1 px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm"
          />
          <input
            type="text"
            value={commanderDraft}
            onChange={(e) => setCommanderDraft(e.target.value)}
            placeholder="Commander"
            maxLength={200}
            className="flex-1 px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm"
          />
          <button
            onClick={saveMeta}
            className="px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover cursor-pointer"
          >
            Save
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {deck.cards.length === 0 ? (
        <p className="text-muted text-sm mb-8">No cards yet{deck.isOwner ? " — add some from your library below." : "."}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-sm font-medium bg-accent-muted text-accent px-2.5 py-1 rounded-full">
              {stats.total} cards · {stats.unique} unique
            </span>
            <span
              className={`text-sm font-medium px-2.5 py-1 rounded-full ${libraryPct === 100 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
              title={`${stats.inLibraryCount} of ${stats.total} cards are in the owner's library`}
            >
              {libraryPct}% in library
            </span>
            {stats.foilCount > 0 && (
              <span className="text-sm font-medium bg-amber-500/15 text-amber-400 px-2.5 py-1 rounded-full">
                {stats.foilCount} foil
              </span>
            )}
            {stats.byGroup.map((g) => (
              <span key={g.group} className="text-xs text-muted bg-surface border border-border px-2 py-1 rounded-full">
                {g.group} · {g.count}
              </span>
            ))}
          </div>
          <div className="space-y-6 mb-8">
            {groups.map((section) => (
              <section key={section.group}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">
                  {section.group} <span className="font-mono">({section.count})</span>
                </h2>
                {renderRows(section.cards)}
              </section>
            ))}
          </div>
          {sideCards.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">
                Sideboard <span className="font-mono">({sideCards.reduce((n, c) => n + c.quantity, 0)})</span>
              </h2>
              {renderRows(sideCards)}
            </div>
          )}
          {maybeCards.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-2">
                Maybeboard <span className="font-mono">({maybeCards.reduce((n, c) => n + c.quantity, 0)})</span>
              </h2>
              {renderRows(maybeCards)}
            </div>
          )}
        </>
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
                <div className="flex gap-2">
                  <select
                    value={importBoard}
                    onChange={(e) => setImportBoard(e.target.value)}
                    className="px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm"
                    aria-label="Import into board"
                  >
                    <option value="main">Main deck</option>
                    <option value="side">Sideboard</option>
                    <option value="maybe">Maybeboard</option>
                  </select>
                  <button
                    onClick={() => runImport({ dryRun: true })}
                    disabled={importBusy || importText.trim().length === 0}
                    className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                  >
                    {importBusy ? "Checking…" : "Import"}
                  </button>
                </div>
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
