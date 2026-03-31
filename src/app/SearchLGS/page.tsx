"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/types/product";

export default function SearchLGS() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Product[]>([]);
    const [error, setError] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [failedStores, setFailedStores] = useState<string[]>([]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;

        setIsLoading(true);
        setError("");
        setFailedStores([]);

        try {
            const response = await fetch("/api/scrapeLGS", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ card: trimmed }),
            });

            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || "Scrape failed");
            }

            const data = (await response.json()) as {
                products: Product[];
                failedStores?: string[];
            };
            setResults(data.products || []);
            setFailedStores(data.failedStores || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="py-8">
            <div className="flex items-end justify-between mb-8 pb-6 border-b border-border">
                <div>
                    <h1 className="text-3xl">LGS Card Search</h1>
                    <p className="text-muted text-sm mt-1">Search local game store inventory</p>
                </div>

                <form onSubmit={handleSubmit} className="flex gap-2">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Card name..."
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            disabled={isLoading}
                            className="w-64 rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                    >
                        {isLoading ? "Searching..." : "Search"}
                    </button>
                </form>
            </div>

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {isLoading && (
                <p className="text-muted text-sm">Searching stores...</p>
            )}

            {failedStores.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-6">
                    <p className="text-sm text-amber-400">
                        {failedStores.join(", ")} unavailable — results may be incomplete
                    </p>
                </div>
            )}

            {results.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {results.map((product) => (
                        <a
                            key={product.link}
                            href={product.link}
                            rel="noopener noreferrer"
                            target="_blank"
                            className="group rounded-lg border border-border bg-surface overflow-hidden hover:border-accent/40 transition-colors"
                        >
                            <div className="aspect-[315/440] overflow-hidden bg-background">
                                <img
                                    src={product.image}
                                    alt={product.title}
                                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                                />
                            </div>
                            <div className="p-3">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{product.title}</p>
                                        <p className="text-xs text-muted uppercase font-mono mt-0.5">{product.store}</p>
                                    </div>
                                    <span className="flex-shrink-0 text-sm font-semibold text-accent bg-accent-muted px-2 py-0.5 rounded">
                                        {product.price}
                                    </span>
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
