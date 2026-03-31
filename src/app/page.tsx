import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <main className="flex flex-col items-center text-center gap-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent-muted px-4 py-1.5 text-sm font-medium text-accent mb-2">
          MTG Collection Tool
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          Card Search
        </h1>

        <p className="text-muted text-lg max-w-md">
          Search your friends&apos; Moxfield collections or find cards at local game stores.
        </p>

        <div className="flex gap-4 mt-6">
          <Link
            href="/checkDeck"
            className="inline-flex items-center rounded-lg bg-accent px-6 py-3 text-base font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Friend Collections
          </Link>
          <Link
            href="/SearchLGS"
            className="inline-flex items-center rounded-lg border border-border bg-surface px-6 py-3 text-base font-medium text-foreground hover:bg-surface-hover transition-colors"
          >
            LGS Search
          </Link>
        </div>
      </main>
    </div>
  );
}
