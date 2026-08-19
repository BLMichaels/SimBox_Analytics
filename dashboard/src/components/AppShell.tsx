import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const links = [
  { to: "/events", label: "Events" },
  { to: "/dashboard", label: "Overview" },
  { to: "/cases", label: "Cases" },
  { to: "/help", label: "Help" },
];

export function AppShell() {
  const { adminName, user, signOut } = useAuth();

  return (
    <div className="min-h-svh bg-paper text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-svh flex-col lg:flex-row">
        <aside className="border-b border-line bg-ink text-paper lg:w-60 lg:border-b-0 lg:border-r lg:border-line">
          <div className="px-5 py-5">
            <p className="font-serif text-xl font-semibold tracking-tight text-card">SimBox</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-paper-2">
              Usage analytics
            </p>
          </div>
          <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  [
                    "rounded-sm px-3 py-2 text-sm whitespace-nowrap",
                    isActive
                      ? "bg-teal text-card"
                      : "text-paper-2 hover:bg-ink-soft hover:text-card",
                  ].join(" ")
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden border-t border-white/10 px-5 py-4 text-xs text-paper-2 lg:block">
            <p className="truncate">{adminName || user?.email}</p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2 text-left underline-offset-2 hover:text-card hover:underline"
            >
              Sign out
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 lg:hidden">
            <p className="truncate text-sm text-ink-soft">{adminName || user?.email}</p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm text-teal-deep underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </header>
          <main id="main" className="flex-1 px-4 py-6 sm:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
