"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import ThemeToggle from "../components/theme-toggle"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const message = searchParams.get("message")

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() || undefined, password }),
      })

      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        router.push(data.redirect || "/")
      } else if (res.status === 401) {
        setError("Invalid username or password.")
      } else if (res.status === 429) {
        setError(data?.error ?? "Too many attempts — try again shortly.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        {message === "admin-required" && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-medium text-amber-400">
              Admin access required — enter the admin password
            </p>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-8">
          <h1 className="text-xl font-bold font-narrow text-foreground mb-1">
            TableTally
          </h1>
          <p className="text-sm text-muted mb-6">
            Sign in with your account
          </p>

          <form onSubmit={handleSubmit}>
            <div>
              <label htmlFor="login-username" className="text-sm font-medium text-foreground mb-1.5 block">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-username"
                autoComplete="username"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
                disabled={isLoading}
              />
            </div>

            <div className="mt-4">
              <label htmlFor="login-password" className="text-sm font-medium text-foreground mb-1.5 block">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`mt-6 w-full rounded-lg bg-accent px-6 py-2.5 text-base font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer${isLoading ? " opacity-50 cursor-not-allowed" : ""}`}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            {error && (
              <p className="mt-3 text-sm font-medium text-red-400">{error}</p>
            )}

            <p className="mt-4 text-xs text-muted">
              No account? Ask the admin for an invite link.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
