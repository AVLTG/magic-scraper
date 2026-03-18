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
        <div>
            <div className="flex items-end justify-between mb-8 pb-2 border-b">
                <h1 className="text-4xl">LGS Card Search</h1>

                {/* Search */}
                <form onSubmit={handleSubmit} className="card-search-form">
                    <div className="relative card-search-input-container">
                        <input
                            type="text"
                            placeholder="Insert card name"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            disabled={isLoading}
                            className="card-search-input"
                        />
                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 pointer-events-none" />
                    </div>
                    {/* <button type="submit" disabled={isLoading} className="card-search-button">
                        {isLoading ? "Searching..." : "Search"}
                    </button> */}
                </form>
            </div>

            {error && <p>{error}</p>}
            {isLoading ? "Searching..." : null}

            {failedStores.length > 0 && (
                <p className="text-sm text-yellow-600 mb-4">
                    {failedStores.join(", ")} unavailable — results may be incomplete
                </p>
            )}

            {/* Results */}
            <ul className="card-search-results">
                {results.map((product) => (
                    <li key={product.link} className="card-search-item">
                        <img src={product.image} alt={product.title} width={315} height={440} />
                        <a href={product.link} rel="noopener noreferrer" target="_blank" className="flex justify-between mt-2 gap-4 w-[320px]">
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold">{product.title}</span>
                                <span className="text-sm text-gray-500 uppercase font-mono">{product.store}</span>
                            </div>
                            <div className="flex-shrink-0 rounded-md bg-accent1 h-min px-2 py-1 text-background">
                                {product.price}
                            </div>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}