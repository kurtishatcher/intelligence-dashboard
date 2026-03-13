import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Intelligence Dashboard | Hatching Solutions",
  description: "Competitive & Federal Procurement Analytics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <main className="min-h-screen pt-12">
          <div style={{ paddingLeft: 'clamp(1.5rem, 5vw, 5rem)', paddingRight: 'clamp(1.5rem, 5vw, 3rem)', paddingTop: '2rem', paddingBottom: '2rem', maxWidth: '80rem' }}>
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
