"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST" })
    const data = await res.json()
    router.push(data.redirect || "/login")
  }

  const navLinks = [
    { href: "/checkDeck", label: "Friend Collections" },
    { href: "/SearchLGS", label: "LGS Search" },
  ]

  return (
    <header className="flex py-6 justify-between items-center border-b border-border">
      <Link href="/" className="text-lg font-bold font-narrow tracking-tight text-foreground hover:text-accent transition-colors">
        MTGCardSearch
      </Link>
      <nav>
        <ul className="flex gap-1 text-sm font-medium items-center">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  pathname === link.href
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:text-foreground hover:bg-surface"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li className="ml-2 pl-2 border-l border-border">
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
            >
              Log out
            </button>
          </li>
        </ul>
      </nav>
    </header>
  )
}
