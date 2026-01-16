import { useEffect, useState } from "react";

/**
 * Splits a file path into directory and filename parts.
 * Used for rendering where directory can be truncated but filename is protected.
 */
export function splitPath(path: string): {
	directory: string | null;
	filename: string;
} {
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash === -1) {
		return { directory: null, filename: path };
	}
	return {
		directory: path.slice(0, lastSlash),
		filename: path.slice(lastSlash + 1),
	};
}

/**
 * Custom hook for debouncing a value
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		return () => clearTimeout(timer);
	}, [value, delay]);

	return debouncedValue;
}
