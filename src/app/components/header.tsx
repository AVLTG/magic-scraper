"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import ThemeToggle from "./theme-toggle"

export default function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    setMenuOpen(false)
    const res = await fetch("/api/auth/logout", { method: "POST" })
    const data = await res.json()
    router.push(data.redirect || "/login")
  }

  const navLinks = [
    { href: "/checkDeck", label: "Friend Collections" },
    { href: "/games", label: "Games" },
    { href: "/stats", label: "Stats" },
    { href: "/SearchLGS", label: "LGS Search" },
  ]

  return (
    <header className="flex py-6 justify-between items-center border-b border-border relative">
      <Link href="/" className="text-lg font-bold font-narrow tracking-tight text-foreground hover:text-accent transition-colors">
        MTGCardSearch
      </Link>

      {/* Desktop nav */}
      <nav className="hidden sm:block">
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
            <ThemeToggle />
          </li>
          <li className="pl-1">
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
            >
              Log out
            </button>
          </li>
        </ul>
      </nav>

      {/* Mobile controls */}
      <div className="flex items-center gap-2 sm:hidden">
        <ThemeToggle />
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition-colors cursor-pointer"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 mt-px border border-border rounded-lg bg-surface shadow-lg z-50 sm:hidden">
          <nav className="p-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === link.href
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:text-foreground hover:bg-surface-hover"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2.5 rounded-md text-sm font-medium text-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Log out
            </button>
          </nav>
        </div>
      )}
    </header>
  )
}
