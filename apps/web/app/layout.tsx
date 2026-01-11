import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@sandcastle/ui/globals.css";
import { LoadingScreen } from "@/features/app/loading-screen";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "Sandcastle",
	description: "AI-powered coding assistant",
};

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
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className="antialiased">
				<LoadingScreen />
				{children}
			</body>
		</html>
	);
}
