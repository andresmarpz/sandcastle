import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@sandcastle/ui/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Sandcastle",
  description: "AI-powered coding assistant",
};

// Inline loading screen styles for instant display
const loadingScreenStyles = `
  #loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: oklch(1 0 0);
    z-index: 9999;
  }
  .dark #loading-screen {
    background: oklch(0.145 0 0);
  }
  #loading-screen h1 {
    font-size: 1.5rem;
    font-weight: 500;
    margin-bottom: 1.5rem;
    color: oklch(0.145 0 0);
  }
  .dark #loading-screen h1 {
    color: oklch(0.985 0 0);
  }
  .loading-spinner {
    --pixel-size: 8px;
    --gap: 2px;
    --active-color: oklch(0.145 0 0);
    --inactive-color: oklch(0.145 0 0 / 0.05);
    display: grid;
    grid-template-columns: repeat(3, var(--pixel-size));
    gap: var(--gap);
  }
  .dark .loading-spinner {
    --active-color: oklch(0.985 0 0);
    --inactive-color: oklch(0.985 0 0 / 0.05);
  }
  .loading-spinner .pixel {
    width: var(--pixel-size);
    height: var(--pixel-size);
    border-radius: 1px;
    background: var(--inactive-color);
  }
  .loading-spinner .pixel-center {
    width: var(--pixel-size);
    height: var(--pixel-size);
    background: transparent;
  }
  .loading-spinner .pixel:nth-child(1) { animation: pixel-fade 640ms ease-in-out infinite 0ms; }
  .loading-spinner .pixel:nth-child(2) { animation: pixel-fade 640ms ease-in-out infinite 80ms; }
  .loading-spinner .pixel:nth-child(3) { animation: pixel-fade 640ms ease-in-out infinite 160ms; }
  .loading-spinner .pixel:nth-child(6) { animation: pixel-fade 640ms ease-in-out infinite 240ms; }
  .loading-spinner .pixel:nth-child(9) { animation: pixel-fade 640ms ease-in-out infinite 320ms; }
  .loading-spinner .pixel:nth-child(8) { animation: pixel-fade 640ms ease-in-out infinite 400ms; }
  .loading-spinner .pixel:nth-child(7) { animation: pixel-fade 640ms ease-in-out infinite 480ms; }
  .loading-spinner .pixel:nth-child(4) { animation: pixel-fade 640ms ease-in-out infinite 560ms; }
  @keyframes pixel-fade {
    0%, 100% { background: var(--inactive-color); }
    12.5%, 50% { background: var(--active-color); }
  }
`;

// Theme detection script (runs before React hydrates)
const themeScript = `
  (function() {
    const t = localStorage.getItem("theme") ?? "system";
    const isDark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: loadingScreenStyles }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <div id="loading-screen">
          <h1>Sandcastle</h1>
          <div className="loading-spinner">
            <span className="pixel" />
            <span className="pixel" />
            <span className="pixel" />
            <span className="pixel" />
            <span className="pixel-center" />
            <span className="pixel" />
            <span className="pixel" />
            <span className="pixel" />
            <span className="pixel" />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
