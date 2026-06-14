"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";

interface DeckSummary { id: string; name: string; cardCount: number }
interface MissingCard { line: number; cardName: string; set: string | null; collectorNumber: string | null }
interface ImportError { line: number; raw: string; reason: string }

export default function DecksPage() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [isLegacyAdmin, setIsLegacyAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // create form
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");

  // import flow: idle -> editing -> prompt (missing list) -> done
  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState("");
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [missing, setMissing] = useState<MissingCard[] | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const loadDecks = async () => {
    try {
      const res = await fetch("/api/decks");
      if (!res.ok) throw new Error("Failed to load decks");
      const data = await res.json();
      setDecks(Array.isArray(data.userDecks) ? data.userDecks : []);
      setIsLegacyAdmin(Boolean(data.isLegacyAdmin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadDecks(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError("");
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreateError(typeof data.error === "string" ? data.error : "Failed to create deck");
      return;
    }
    setNewName("");
    await loadDecks();
  };

  const runImport = async (body: Record<string, unknown>) => {
    setIsImporting(true);
    setImportStatus("");
    try {
      const res = await fetch("/api/decks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: importName, text: importText, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(data.cards) ? `: ${data.cards.join(", ")}` : "";
        setImportStatus(`${typeof data.error === "string" ? data.error : "Import failed"}${detail}`);
        return;
      }
      if (body.dryRun) {
        setImportErrors(Array.isArray(data.errors) ? data.errors : []);
        if (Array.isArray(data.missing) && data.missing.length > 0) {
          setMissing(data.missing); // show the yes/no prompt
        } else {
          // nothing missing — commit immediately
          await runImport({ dryRun: false, addMissingToLibrary: false });
        }
        return;
      }
      // committed
      setShowImport(false);
      setImportName("");
      setImportText("");
      setMissing(null);
      setImportErrors([]);
      await loadDecks();
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) return <div className="py-8 text-muted">Loading…</div>;

  return (
    <div className="py-8">
      <h1 className="text-3xl mb-2">My Decks</h1>
      <p className="text-muted mb-6">Create decks and fill them with cards from your library.</p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isLegacyAdmin ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          The bootstrap admin has no library or decks — create your account via an invite first.
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <form onSubmit={handleCreate} className="flex gap-2 flex-1">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New deck name"
                maxLength={100}
                className="flex-1 px-3 py-2 rounded-md border border-border bg-surface text-foreground"
              />
              <button
                type="submit"
                disabled={newName.trim().length === 0}
                className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
              >
                Create
              </button>
            </form>
            <button
              onClick={() => setShowImport((v) => !v)}
              className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-surface transition-colors cursor-pointer"
            >
              {showImport ? "Cancel import" : "Import from Moxfield"}
            </button>
          </div>
          {createError && <p className="text-sm text-red-400 -mt-6 mb-6">{createError}</p>}

          {showImport && (
            <div className="rounded-lg border border-border bg-surface p-4 mb-8 space-y-3">
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Deck name"
                maxLength={100}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
              />
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"1 Treasure Vault (AFR) 261 *F*\n1 Spikefield Hazard / Spikefield Cave (ZNR) 166 *F*\n1 Secluded Starforge (EOE) 257"}
                className="w-full h-48 p-3 rounded-md border border-border bg-background text-foreground font-mono text-sm"
              />
              {missing === null ? (
                <button
                  onClick={() => runImport({ dryRun: true })}
                  disabled={isImporting || importName.trim().length === 0 || importText.trim().length === 0}
                  className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? "Checking…" : "Import"}
                </button>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-sm text-amber-400 font-medium">
                    {missing.length} card{missing.length !== 1 ? "s are" : " is"} not in your library:
                  </p>
                  <pre className="text-xs text-foreground/80 max-h-40 overflow-auto whitespace-pre-wrap">
                    {missing.map((m) => m.cardName).join("\n")}
                  </pre>
                  <p className="text-sm text-muted">Add them to your library?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => runImport({ dryRun: false, addMissingToLibrary: true })}
                      disabled={isImporting}
                      className="px-3 py-1.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                    >
                      Yes — add to library
                    </button>
                    <button
                      onClick={() => runImport({ dryRun: false, addMissingToLibrary: false })}
                      disabled={isImporting}
                      className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
                    >
                      No — import without them
                    </button>
                  </div>
                </div>
              )}
              {importStatus && <p className="text-sm text-red-400">{importStatus}</p>}
              {importErrors.length > 0 && (
                <div className="text-xs text-amber-400">
                  {importErrors.map((e) => (
                    <p key={e.line}>Line {e.line}: {e.reason} — &quot;{e.raw}&quot;</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {decks.length === 0 ? (
            <p className="text-muted text-sm">No decks yet — create one above or add one while logging a game.</p>
          ) : (
            <div className="space-y-2">
              {decks.map((deck) => (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:border-accent/40 hover:bg-surface transition-colors"
                >
                  <span className="font-semibold">{deck.name}</span>
                  <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded-full">
                    {deck.cardCount} card{deck.cardCount !== 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
