'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Overview', icon: '\u25C9' },
  { href: '/federal', label: 'Federal Intel', icon: '\u2605' },
  { href: '/competitors', label: 'Competitors', icon: '\u25C6' },
  { href: '/brief', label: 'Daily Brief', icon: '\u25A4' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <>
      {/* Top header bar — always visible */}
      <div
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--bg-sidebar)' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(!open)}
            className="text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Toggle menu"
          >
            {open ? '\u2715' : '\u2630'}
          </button>
          <span className="text-white font-semibold text-sm tracking-wide">INTELLIGENCE DASHBOARD</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-sidebar)' }}>Hatching Solutions</span>
      </div>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 pt-12" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar drawer */}
      <aside
        className={`fixed top-12 left-0 h-[calc(100%-3rem)] w-64 z-50 flex flex-col transition-transform duration-200 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg-sidebar)' }}
      >
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-white/15 text-white font-medium' : 'hover:bg-white/10'
                }`}
                style={{ color: isActive ? 'var(--text-sidebar-active)' : 'var(--text-sidebar)' }}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-white/10">
          <p className="text-xs" style={{ color: 'var(--text-sidebar)' }}>v1.0 MVP</p>
        </div>
      </aside>
    </>
  );
}
