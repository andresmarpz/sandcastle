import { getVersion } from "@tauri-apps/api/app";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { type UpdaterState, useUpdater } from "@/hooks/use-updater";

interface UpdaterContextValue {
	state: UpdaterState;
	checkForUpdates: () => Promise<void>;
}

const UpdaterContext = createContext<UpdaterContextValue | undefined>(
	undefined,
);

export function UpdaterProvider({ children }: { children: React.ReactNode }) {
	const [currentVersion, setCurrentVersion] = useState<string>("");
	const updater = useUpdater();
	const toastIdRef = useRef<string | number | null>(null);

	useEffect(() => {
		getVersion().then(setCurrentVersion);
	}, []);

	// Dismiss any persistent toast when leaving downloading state
	useEffect(() => {
		if (updater.state !== "downloading" && toastIdRef.current !== null) {
			toast.dismiss(toastIdRef.current);
			toastIdRef.current = null;
		}
	}, [updater.state]);

	// Show "update available" toast
	useEffect(() => {
		if (updater.state === "available" && updater.update) {
			toastIdRef.current = toast.info(
				() => (
					<div className="flex flex-col gap-0.5">
						<span>Update available</span>
						<span className="text-muted-foreground">
							{currentVersion} → {updater.update?.version}
						</span>
					</div>
				),
				{
					duration: 10000,
					action: {
						label: "Update and restart",
						onClick: () => {
							updater.downloadAndInstall();
						},
					},
					onDismiss: () => {
						toastIdRef.current = null;
					},
					onAutoClose: () => {
						toastIdRef.current = null;
					},
				},
			);
		}
	}, [
		updater.state,
		updater.update,
		currentVersion,
		updater.downloadAndInstall,
	]);

	// Show downloading toast
	useEffect(() => {
		if (updater.state === "downloading") {
			toastIdRef.current = toast.loading("Downloading update...", {
				duration: Number.POSITIVE_INFINITY,
			});
		}
	}, [updater.state]);

	// Show error toast
	useEffect(() => {
		if (updater.state === "error" && updater.error) {
			toast.error(`Update failed: ${updater.error}`, {
				duration: 5000,
			});
		}
	}, [updater.state, updater.error]);

	const value = useMemo(
		() => ({
			state: updater.state,
			checkForUpdates: updater.checkForUpdates,
		}),
		[updater.state, updater.checkForUpdates],
	);

	return (
		<UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
	);
}

export function useUpdaterContext() {
	const context = useContext(UpdaterContext);
	if (!context) {
		throw new Error("useUpdaterContext must be used within an UpdaterProvider");
	}
	return context;
}
