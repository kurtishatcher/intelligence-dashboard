"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "\u2318" },
  { href: "/federal", label: "Federal Intel", icon: "\u2605" },
  { href: "/competitors", label: "Competitors", icon: "\u25CF" },
  { href: "/brief", label: "Briefs", icon: "\u25A4" },
];

const SYSTEM_LINKS = [
  { label: "One-Center Ecosystem", href: "https://one-center-ecosystem.vercel.app" },
  { label: "Command Center", href: "https://command-center-five-mu.vercel.app" },
  { label: "Knowledge System", href: "https://knowledge-system-hazel.vercel.app" },
  { label: "Research Pipeline", href: "https://webresearch-pipeline.vercel.app" },
  { label: "AI ROI Tracker", href: "https://ai-roi-tracker-azure.vercel.app" },
  { label: "Daily Digest", href: "https://daily-digest-lovat.vercel.app" },
  { label: "Info Digest", href: "https://information-digest-web.vercel.app" },
  { label: "Public Payments", href: "https://public-payments.vercel.app" },
  { label: "Consulting Website", href: "https://consulting-website-gules.vercel.app" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      <aside
        className="fixed left-0 top-0 h-full w-56 text-white flex flex-col"
        style={{ backgroundColor: "var(--navy)" }}
      >
        <div className="p-4 border-b border-white/10">
          <h1 className="text-lg font-bold tracking-tight">Intelligence Dashboard</h1>
          <p className="text-xs text-white/50 mt-0.5">Hatching Solutions</p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive(item.href)
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}

          <div className="pt-3 mt-3 border-t border-white/10">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/30">Systems</p>
            <div className="space-y-1">
              {SYSTEM_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/30 flex-shrink-0" />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>
      <main className="ml-56 min-h-screen p-8">{children}</main>
    </>
  );
}
