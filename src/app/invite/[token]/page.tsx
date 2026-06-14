"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import ThemeToggle from "../../components/theme-toggle"

type Preflight =
  | { state: "loading" }
  | { state: "invalid" }
  | { state: "ready"; username: string | null; locked: boolean }

export default function InvitePage() {
  const router = useRouter()
  const params = useParams<{ token: string }>()
  const token = params.token

  const [preflight, setPreflight] = useState<Preflight>({ state: "loading" })
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/invites/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data?.valid) {
          setPreflight({ state: "ready", username: data.username, locked: data.locked })
          if (data.username) setUsername(data.username)
        } else {
          setPreflight({ state: "invalid" })
        }
      })
      .catch(() => !cancelled && setPreflight({ state: "invalid" }))
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username: username.trim() || undefined, password }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        router.push(data.redirect || "/")
      } else {
        setError(data?.error ?? "Something went wrong. Please try again.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors disabled:opacity-60"

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-surface p-8">
          <h1 className="text-xl font-bold font-narrow text-foreground mb-1">TableTally</h1>

          {preflight.state === "loading" && (
            <p className="text-sm text-muted">Checking your invite…</p>
          )}

          {preflight.state === "invalid" && (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm font-medium text-red-400">
                This invite link is invalid, expired, or already used. Ask the admin for a new one.
              </p>
            </div>
          )}

          {preflight.state === "ready" && (
            <>
              <p className="text-sm text-muted mb-6">
                {preflight.locked
                  ? `Welcome! Set a password for "${preflight.username}" to finish creating your account.`
                  : "Welcome! Pick a username and password to create your account."}
              </p>

              <form onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="invite-username" className="text-sm font-medium text-foreground mb-1.5 block">
                    Username
                  </label>
                  <input
                    id="invite-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your-username"
                    autoComplete="username"
                    className={inputClass}
                    disabled={isLoading || preflight.locked}
                    readOnly={preflight.locked}
                  />
                  {preflight.locked && (
                    <p className="mt-1 text-xs text-muted">
                      This invite is tied to an existing collection — the username is fixed.
                    </p>
                  )}
                </div>

                <div className="mt-4">
                  <label htmlFor="invite-password" className="text-sm font-medium text-foreground mb-1.5 block">
                    Password
                  </label>
                  <input
                    id="invite-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={inputClass}
                    disabled={isLoading}
                  />
                  <p className="mt-1 text-xs text-muted">
                    At least 8 characters, with at least one letter and one number.
                  </p>
                </div>

                <div className="mt-4">
                  <label htmlFor="invite-confirm" className="text-sm font-medium text-foreground mb-1.5 block">
                    Confirm password
                  </label>
                  <input
                    id="invite-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={inputClass}
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`mt-6 w-full rounded-lg bg-accent px-6 py-2.5 text-base font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer${isLoading ? " opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isLoading ? "Creating account..." : "Create account"}
                </button>

                {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
