import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
	theme: Theme;
	resolvedTheme: "light" | "dark";
	setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
	undefined,
);

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "light";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function applyTheme(resolved: "light" | "dark") {
	const root = document.documentElement;

	// Disable transitions during theme switch
	root.classList.add("no-transitions");

	if (resolved === "dark") {
		root.classList.add("dark");
	} else {
		root.classList.remove("dark");
	}

	// Re-enable transitions after paint
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			root.classList.remove("no-transitions");
		});
	});
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setThemeState] = React.useState<Theme>(() => {
		if (typeof window === "undefined") return "system";
		return (localStorage.getItem("theme") as Theme) ?? "system";
	});

	const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(
		() => {
			if (theme === "system") return getSystemTheme();
			return theme;
		},
	);

	React.useEffect(() => {
		const resolved = theme === "system" ? getSystemTheme() : theme;
		setResolvedTheme(resolved);
		applyTheme(resolved);
	}, [theme]);

	React.useEffect(() => {
		if (theme !== "system") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) => {
			const resolved = e.matches ? "dark" : "light";
			setResolvedTheme(resolved);
			applyTheme(resolved);
		};
		mediaQuery.addEventListener("change", handler);
		return () => mediaQuery.removeEventListener("change", handler);
	}, [theme]);

	const setTheme = React.useCallback((newTheme: Theme) => {
		localStorage.setItem("theme", newTheme);
		setThemeState(newTheme);
	}, []);

	const value = React.useMemo(
		() => ({ theme, resolvedTheme, setTheme }),
		[theme, resolvedTheme, setTheme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = React.useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
