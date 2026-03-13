'use client';

import { useState } from 'react';
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

  return (
    <>
      {/* Mobile header bar */}
      <div
        className="fixed top-0 left-0 right-0 z-50 md:hidden flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--bg-sidebar)' }}
      >
        <span className="text-white font-semibold text-sm tracking-wide">INTELLIGENCE DASHBOARD</span>
        <button
          onClick={() => setOpen(!open)}
          className="text-white text-2xl leading-none"
          aria-label="Toggle menu"
        >
          {open ? '\u2715' : '\u2630'}
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 z-50 flex flex-col transition-transform duration-200 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg-sidebar)' }}
      >
        <div className="px-6 py-6 border-b border-white/10">
          <h1 className="text-white font-bold text-base tracking-wide">INTELLIGENCE</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-sidebar)' }}>Hatching Solutions</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-white/15 text-white font-medium' : 'hover:bg-white/8'
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

      {/* Mobile spacer */}
      <div className="h-12 md:hidden" />
    </>
  );
}
