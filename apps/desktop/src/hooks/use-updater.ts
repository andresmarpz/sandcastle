import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";

export type UpdaterState =
	| "idle"
	| "checking"
	| "available"
	| "downloading"
	| "ready"
	| "error";

export interface UpdateProgress {
	contentLength: number | undefined;
	downloaded: number;
}

export interface UseUpdaterResult {
	state: UpdaterState;
	update: Update | null;
	progress: UpdateProgress | null;
	error: string | null;
	checkForUpdates: () => Promise<void>;
	downloadAndInstall: () => Promise<void>;
}

export function useUpdater(): UseUpdaterResult {
	const [state, setState] = useState<UpdaterState>("idle");
	const [update, setUpdate] = useState<Update | null>(null);
	const [progress, setProgress] = useState<UpdateProgress | null>(null);
	const [error, setError] = useState<string | null>(null);

	const checkForUpdates = useCallback(async () => {
		try {
			setState("checking");
			setError(null);

			const updateResult = await check();

			if (updateResult) {
				setUpdate(updateResult);
				setState("available");
			} else {
				setState("idle");
			}
		} catch (err) {
			setState("error");
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	const downloadAndInstall = useCallback(async () => {
		if (!update) return;

		try {
			setState("downloading");
			setProgress({ contentLength: undefined, downloaded: 0 });

			await update.downloadAndInstall((event) => {
				switch (event.event) {
					case "Started":
						setProgress({
							contentLength: event.data.contentLength,
							downloaded: 0,
						});
						break;
					case "Progress":
						setProgress((prev) => ({
							contentLength: prev?.contentLength,
							downloaded: (prev?.downloaded ?? 0) + event.data.chunkLength,
						}));
						break;
					case "Finished":
						setState("ready");
						break;
				}
			});

			// Relaunch the app after installation
			await relaunch();
		} catch (err) {
			setState("error");
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [update]);

	// Check for updates on mount
	useEffect(() => {
		checkForUpdates();
	}, [checkForUpdates]);

	return {
		state,
		update,
		progress,
		error,
		checkForUpdates,
		downloadAndInstall,
	};
}
