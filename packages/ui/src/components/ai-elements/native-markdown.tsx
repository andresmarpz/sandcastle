"use client";

import type { ComponentProps } from "react";
import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BundledLanguage, BundledTheme } from "shiki";
import { codeToHtml } from "shiki";
import { Streamdown } from "streamdown";
import { usePlatform } from "@/context/platform-context";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NativeMarkdownProps {
	children: string;
	className?: string;
	/** Shiki theme for code highlighting [light, dark] */
	shikiTheme?: [BundledTheme, BundledTheme];
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Detection (reused from code-block.tsx pattern)
// ─────────────────────────────────────────────────────────────────────────────

const darkModeQuery =
	typeof window !== "undefined"
		? window.matchMedia("(prefers-color-scheme: dark)")
		: null;

function subscribeToDarkMode(callback: () => void) {
	darkModeQuery?.addEventListener("change", callback);
	return () => darkModeQuery?.removeEventListener("change", callback);
}

function getDarkModeSnapshot() {
	return darkModeQuery?.matches ?? false;
}

function getDarkModeServerSnapshot() {
	return false;
}

function useIsDarkMode() {
	return useSyncExternalStore(
		subscribeToDarkMode,
		getDarkModeSnapshot,
		getDarkModeServerSnapshot,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Syntax Highlighting Cache
// ─────────────────────────────────────────────────────────────────────────────

const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

async function highlightCode(
	code: string,
	language: string,
	theme: BundledTheme,
): Promise<string> {
	const cacheKey = `${theme}:${language}:${code}`;

	if (highlightCache.has(cacheKey)) {
		return highlightCache.get(cacheKey) as string;
	}

	try {
		const html = await codeToHtml(code, {
			lang: language as BundledLanguage,
			theme,
		});

		// LRU-style cleanup
		if (highlightCache.size >= MAX_CACHE_SIZE) {
			const firstKey = highlightCache.keys().next().value;
			if (firstKey) highlightCache.delete(firstKey);
		}

		highlightCache.set(cacheKey, html);
		return html;
	} catch {
		// If highlighting fails (e.g., unsupported language), return escaped code
		const escaped = code
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		return `<pre><code>${escaped}</code></pre>`;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Code Block Processing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract code blocks from HTML and apply syntax highlighting.
 * Comrak outputs: <pre><code class="language-xxx">code here</code></pre>
 */
async function processCodeBlocks(
	html: string,
	theme: BundledTheme,
): Promise<string> {
	// Match <pre><code class="language-xxx">...</code></pre> blocks
	const codeBlockRegex =
		/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g;

	const matches: Array<{
		fullMatch: string;
		language: string;
		code: string;
	}> = [];

	for (const match of html.matchAll(codeBlockRegex)) {
		const language = match[1];
		const code = match[2];
		if (language && code) {
			matches.push({
				fullMatch: match[0],
				language,
				// Decode HTML entities that comrak may have escaped
				code: code
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.replace(/&amp;/g, "&")
					.replace(/&quot;/g, '"')
					.replace(/&#39;/g, "'"),
			});
		}
	}

	if (matches.length === 0) {
		return html;
	}

	// Highlight all code blocks in parallel
	const highlightedBlocks = await Promise.all(
		matches.map(async ({ code, language }) =>
			highlightCode(code, language, theme),
		),
	);

	// Replace each code block with its highlighted version
	let result = html;
	for (let i = 0; i < matches.length; i++) {
		const matchEntry = matches[i];
		const highlightedBlock = highlightedBlocks[i];
		if (matchEntry && highlightedBlock) {
			result = result.replace(matchEntry.fullMatch, highlightedBlock);
		}
	}

	return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Native Markdown Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NativeMarkdown component that uses native Rust parsing when available,
 * falling back to Streamdown otherwise.
 *
 * When native parsing is available (Tauri desktop app), this component:
 * 1. Parses markdown to HTML using Rust comrak (fast)
 * 2. Post-processes code blocks with Shiki syntax highlighting
 *
 * On web or when native parsing is unavailable, falls back to Streamdown.
 */
export const NativeMarkdown = memo(function NativeMarkdown({
	children,
	className,
	shikiTheme = ["github-light", "github-dark"],
}: NativeMarkdownProps) {
	const platform = usePlatform();
	const parseMarkdown = platform.parseMarkdown;
	const isDark = useIsDarkMode();
	const [html, setHtml] = useState<string | null>(null);
	const currentRequestRef = useRef(0);

	// Determine the Shiki theme based on dark mode
	const currentTheme = isDark ? shikiTheme[1] : shikiTheme[0];

	// Parse markdown and apply syntax highlighting
	useEffect(() => {
		if (!parseMarkdown || !children) {
			setHtml(null);
			return;
		}

		const requestId = ++currentRequestRef.current;

		(async () => {
			try {
				// Parse markdown to HTML using native Rust parser
				const rawHtml = await parseMarkdown(children);

				// Only update if this is still the current request
				if (requestId !== currentRequestRef.current) return;

				// Apply syntax highlighting to code blocks
				const highlightedHtml = await processCodeBlocks(rawHtml, currentTheme);

				// Only update if this is still the current request
				if (requestId !== currentRequestRef.current) return;

				setHtml(highlightedHtml);
			} catch (error) {
				console.error("Native markdown parsing failed:", error);
				// Fall back to Streamdown by setting html to null
				if (requestId === currentRequestRef.current) {
					setHtml(null);
				}
			}
		})();
	}, [parseMarkdown, children, currentTheme]);

	// If native parsing is available and we have HTML, render it
	if (parseMarkdown && html !== null) {
		return (
			<div
				className={cn(
					// Base prose styling
					"prose prose-sm dark:prose-invert max-w-none",
					// Match Streamdown styling
					"size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
					"[&_ul]:pl-4 [&_ol]:pl-4 [&_li]:wrap-break-word",
					// Code block styling
					"[&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:p-4 [&_pre]:bg-muted",
					"[&_code]:font-mono [&_code]:text-sm",
					"[&_pre_code]:bg-transparent [&_pre_code]:p-0",
					// Inline code
					"[&>p_code]:rounded [&>p_code]:bg-muted [&>p_code]:px-1.5 [&>p_code]:py-0.5",
					className,
				)}
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		);
	}

	// Fall back to Streamdown
	return (
		<Streamdown
			className={cn(
				"size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
				"[&_ul]:pl-4 [&_ol]:pl-4 [&_li]:wrap-break-word",
				className,
			)}
			shikiTheme={shikiTheme}
		>
			{children}
		</Streamdown>
	);
});

NativeMarkdown.displayName = "NativeMarkdown";

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper that matches MessageResponse API
// ─────────────────────────────────────────────────────────────────────────────

export type NativeMarkdownResponseProps = ComponentProps<typeof Streamdown>;

/**
 * Drop-in replacement for MessageResponse that uses native markdown parsing
 * when available. Accepts all Streamdown props for compatibility.
 */
export const NativeMarkdownResponse = memo(
	({
		className,
		children,
		shikiTheme = ["github-light", "github-dark"],
		...props
	}: NativeMarkdownResponseProps) => {
		const platform = usePlatform();

		// If children is not a string or native parsing is unavailable, use Streamdown
		if (typeof children !== "string" || !platform.parseMarkdown) {
			return (
				<Streamdown
					className={cn(
						"size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
						"[&_ul]:pl-4 [&_ol]:pl-4 [&_li]:wrap-break-word",
						className,
					)}
					shikiTheme={shikiTheme}
					{...props}
				>
					{children}
				</Streamdown>
			);
		}

		return (
			<NativeMarkdown className={className} shikiTheme={shikiTheme}>
				{children}
			</NativeMarkdown>
		);
	},
	(prevProps, nextProps) => prevProps.children === nextProps.children,
);

NativeMarkdownResponse.displayName = "NativeMarkdownResponse";
