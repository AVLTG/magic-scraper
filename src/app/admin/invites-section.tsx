"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

interface AdminUser {
  id: string
  name: string
  username: string | null
}

interface InviteRow {
  id: string
  suggestedUsername: string | null
  targetUserName: string | null
  role: string
  status: "pending" | "used" | "expired"
  expiresAt: string
  createdAt: string
}

export default function InvitesSection() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [inviteType, setInviteType] = useState<"open" | "bound">("bound")
  const [targetUserId, setTargetUserId] = useState("")
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [createdType, setCreatedType] = useState<"open" | "bound" | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invites"),
      ])
      if (usersRes.ok) setUsers(await usersRes.json())
      if (invitesRes.ok) setInvites(await invitesRes.json())
    } catch {
      // non-fatal; section just shows empty state
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const unboundUsers = users.filter((u) => !u.username)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setIsCreating(true)
    setError(null)
    setCreatedUrl(null)
    setCreatedType(null)
    setCopied(false)
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: inviteType,
          targetUserId: inviteType === "bound" ? targetUserId : undefined,
          role: makeAdmin ? "ADMIN" : "MEMBER",
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        setCreatedUrl(data.url)
        setCreatedType(inviteType)
        refresh()
      } else {
        setError(data?.error ?? "Failed to create invite")
      }
    } catch {
      setError("Failed to create invite")
    } finally {
      setIsCreating(false)
    }
  }

  async function handleCopy() {
    if (!createdUrl) return
    try {
      // clipboard API is unavailable outside secure contexts (non-localhost http)
      await navigator.clipboard.writeText(createdUrl)
      setCopied(true)
    } catch {
      setError("Couldn't access the clipboard — select and copy the link manually.")
    }
  }

  function handleSelfAssign() {
    // Self-assign = redeem your own invite right now
    if (createdUrl) router.push(new URL(createdUrl).pathname)
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this invite?")) return
    const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" })
    if (res.ok) refresh()
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold font-narrow text-foreground mb-1">Invites</h2>
      <p className="text-sm text-muted mb-4">
        Invite friends to create accounts. Bound invites attach to an existing collection user
        (username locked to their name); open invites let them pick a username. To self-assign,
        create a bound invite for your own user and open the link.
      </p>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="invite-type" className="text-sm font-medium text-foreground mb-1.5 block">Type</label>
          <select
            id="invite-type"
            value={inviteType}
            onChange={(e) => setInviteType(e.target.value as "open" | "bound")}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="bound">Bound to collection user</option>
            <option value="open">Open (they pick a username)</option>
          </select>
        </div>

        {inviteType === "bound" && (
          <div>
            <label htmlFor="invite-target-user" className="text-sm font-medium text-foreground mb-1.5 block">User</label>
            <select
              id="invite-target-user"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              required
            >
              <option value="">Select user…</option>
              {unboundUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {unboundUsers.length === 0 && (
              <p className="mt-1 text-xs text-muted">
                All collection users already have accounts — use an open invite.
              </p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-foreground pb-2">
          <input
            type="checkbox"
            checked={makeAdmin}
            onChange={(e) => setMakeAdmin(e.target.checked)}
          />
          Admin account
        </label>

        <button
          type="submit"
          disabled={isCreating || (inviteType === "bound" && !targetUserId)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
        >
          {isCreating ? "Creating…" : "Create invite"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}

      {createdUrl && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-400 mb-2">
            Invite created — copy it now, the link is only shown once:
          </p>
          <code className="block break-all text-xs text-foreground mb-2">{createdUrl}</code>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors cursor-pointer"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            {createdType === "bound" && (
              <button
                onClick={handleSelfAssign}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors cursor-pointer"
              >
                Open now (self-assign)
              </button>
            )}
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 font-medium">For</th>
              <th className="py-1.5 font-medium">Role</th>
              <th className="py-1.5 font-medium">Status</th>
              <th className="py-1.5 font-medium">Expires</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id} className="border-t border-border text-foreground">
                <td className="py-2">{inv.targetUserName ?? inv.suggestedUsername ?? "Open invite"}</td>
                <td className="py-2">{inv.role}</td>
                <td className="py-2">
                  <span
                    className={
                      inv.status === "pending"
                        ? "text-amber-400"
                        : inv.status === "used"
                          ? "text-emerald-400"
                          : "text-muted"
                    }
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="py-2">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                <td className="py-2 text-right">
                  {inv.status === "pending" && (
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      className="text-xs font-medium text-red-400 hover:underline cursor-pointer"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
