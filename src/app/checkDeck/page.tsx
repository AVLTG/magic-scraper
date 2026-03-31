"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Owner {
  name: string;
  quantity: number;
  condition: string;
  isFoil: boolean;
}

interface Printing {
  set: string;
  setName: string;
  scryfallId: string;
  owners: Owner[];
}

interface CardMatch {
  cardName: string;
  printings: Printing[];
}

export default function CheckDeck() {
  const [decklist, setDecklist] = useState("");
  const [results, setResults] = useState<CardMatch[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const toggleCard = (cardName: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(cardName)) {
      newExpanded.delete(cardName);
    } else {
      newExpanded.add(cardName);
    }
    setExpandedCards(newExpanded);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decklist.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/checkDeck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decklist }),
      });

      if (!response.ok) {
        throw new Error("Failed to check deck");
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition.toLowerCase()) {
      case "nearmint":
      case "near mint":
        return "text-emerald-400";
      case "lightlyplayed":
      case "lightly played":
        return "text-sky-400";
      case "moderatelyplayed":
      case "moderately played":
        return "text-amber-400";
      case "heavilyplayed":
      case "heavily played":
        return "text-orange-400";
      case "damaged":
        return "text-red-400";
      default:
        return "text-muted";
    }
  };

  const formatCondition = (condition: string) => {
    return condition
      .replace(/([A-Z])/g, " $1")
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="py-8">
      <h1 className="text-3xl mb-2">Deck Checker</h1>
      <p className="text-muted mb-6">Paste a decklist to find matches in your friends&apos; collections.</p>

      <form onSubmit={handleSubmit} className="mb-8">
        <textarea
          value={decklist}
          onChange={(e) => setDecklist(e.target.value)}
          placeholder="1 Lightning Bolt&#10;4 Counterspell&#10;2 Swords to Plowshares&#10;..."
          className="w-full h-72 p-4 rounded-lg border border-border bg-surface text-foreground font-mono text-sm placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors resize-none"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="mt-3 px-6 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isLoading ? "Checking..." : "Check Deck"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-2xl">Matches</h2>
            <span className="text-sm font-medium text-accent bg-accent-muted px-2.5 py-0.5 rounded-full">
              {results.length} cards
            </span>
          </div>

          <div className="space-y-2">
            {results.map((card) => (
              <div key={card.cardName} className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleCard(card.cardName)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{card.cardName}</span>
                    <span className="text-xs text-muted bg-surface px-2 py-0.5 rounded-full">
                      {card.printings.length} printing{card.printings.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {expandedCards.has(card.cardName) ? (
                    <ChevronDown className="w-4 h-4 text-muted" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted" />
                  )}
                </button>

                {expandedCards.has(card.cardName) && (
                  <div className="px-4 pb-4 border-t border-border bg-surface/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-3">
                      {card.printings.map((printing, idx) => (
                        <div
                          key={idx}
                          className="group relative rounded-lg border border-border bg-background p-3 hover:border-accent/40 transition-colors"
                        >
                          {/* Hover image */}
                          <div className="hidden group-hover:block fixed z-[9999] pointer-events-none">
                            <img
                              src={`https://api.scryfall.com/cards/${printing.scryfallId}?format=image`}
                              alt={card.cardName}
                              className="w-64 rounded-lg shadow-2xl border border-border"
                              style={{
                                position: 'fixed',
                                right: '20px',
                                bottom: '20px',
                              }}
                            />
                          </div>

                          {/* Set info */}
                          <div className="font-medium text-sm mb-2 pb-2 border-b border-border">
                            {printing.setName}
                            <span className="text-xs text-muted ml-2">
                              ({printing.set.toUpperCase()})
                            </span>
                          </div>

                          {/* Owners */}
                          <div className="space-y-1.5">
                            {printing.owners.map((owner, ownerIdx) => (
                              <div
                                key={ownerIdx}
                                className="flex items-center justify-between text-sm"
                              >
                                <span className="font-medium truncate mr-2 text-foreground/80">
                                  {owner.name}
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="bg-surface text-muted px-1.5 py-0.5 rounded text-xs font-mono">
                                    x{owner.quantity}
                                  </span>
                                  <span className={`text-xs font-medium ${getConditionColor(owner.condition)}`}>
                                    {formatCondition(owner.condition)}
                                  </span>
                                  {owner.isFoil && (
                                    <span className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                      Foil
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
