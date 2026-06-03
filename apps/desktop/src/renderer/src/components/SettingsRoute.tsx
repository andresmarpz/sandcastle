import { useEffect, useState } from "react";

import { playCue } from "@/lib/activitySounds";
import { cn } from "@/lib/utils";
import { useSoundSettings } from "@/stores/soundSettings";

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<section className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4">
			<div className="space-y-0.5">
				<h2 className="text-sm font-medium">{title}</h2>
				{description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
			</div>
			{children}
		</section>
	);
}

function Toggle({
	checked,
	disabled,
	onChange,
	label,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (next: boolean) => void;
	label: string;
}): React.JSX.Element {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
				checked ? "bg-primary" : "bg-muted",
				disabled && "opacity-40",
			)}
		>
			<span
				className={cn(
					"inline-block size-4 rounded-full bg-background shadow transition-transform",
					checked ? "translate-x-4" : "translate-x-0.5",
				)}
			/>
		</button>
	);
}

function SettingsRoute(): React.JSX.Element {
	const muted = useSoundSettings((s) => s.muted);
	const volume = useSoundSettings((s) => s.volume);
	const setMuted = useSoundSettings((s) => s.setMuted);
	const setVolume = useSoundSettings((s) => s.setVolume);

	const [hooksEnabled, setHooksEnabled] = useState<boolean | null>(null);

	useEffect(() => {
		let active = true;
		void window.api.claude.getHooksEnabled().then((value) => {
			if (active) setHooksEnabled(value);
		});
		return () => {
			active = false;
		};
	}, []);

	const toggleHooks = (next: boolean): void => {
		setHooksEnabled(next);
		void window.api.claude.setHooksEnabled(next).then((value) => setHooksEnabled(value));
	};

	return (
		<div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-6">
			<header className="space-y-1">
				<h1 className="text-lg font-semibold">Settings</h1>
				<p className="text-xs text-muted-foreground">
					Workspace activity detection and notifications.
				</p>
			</header>

			<Section
				title="Notification sounds"
				description="Play a chime when Claude finishes a turn or needs your attention in a background pane. Sounds are suppressed for the pane you're actively looking at."
			>
				<div className="flex items-center justify-between">
					<span className="text-xs">Mute notification sounds</span>
					<Toggle checked={muted} onChange={setMuted} label="Mute notification sounds" />
				</div>
				<div className="flex items-center gap-3">
					<span className="w-14 shrink-0 text-xs text-muted-foreground">Volume</span>
					<input
						type="range"
						min={0}
						max={100}
						value={volume}
						disabled={muted}
						onChange={(e) => setVolume(Number(e.currentTarget.value))}
						className="h-1 flex-1 cursor-pointer accent-primary disabled:opacity-40"
						aria-label="Notification volume"
					/>
					<span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
						{volume}
					</span>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						disabled={muted}
						onClick={() => playCue("complete")}
						className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-sidebar-accent/60 disabled:opacity-40"
					>
						Preview finished
					</button>
					<button
						type="button"
						disabled={muted}
						onClick={() => playCue("attention")}
						className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-sidebar-accent/60 disabled:opacity-40"
					>
						Preview needs attention
					</button>
				</div>
			</Section>

			<Section
				title="Claude Code integration"
				description="Installs lifecycle hooks in ~/.claude/settings.json so Sandcastle can show precise working / needs-attention / done status, flag workspaces with an active /loop cron, and play sounds. The hook is a no-op outside Sandcastle. Disabling removes the hooks."
			>
				<div className="flex items-center justify-between">
					<span className="text-xs">
						Enable activity hooks
						{hooksEnabled === null ? (
							<span className="ml-2 text-foreground-tertiary">…</span>
						) : null}
					</span>
					<Toggle
						checked={hooksEnabled === true}
						disabled={hooksEnabled === null}
						onChange={toggleHooks}
						label="Enable Claude Code activity hooks"
					/>
				</div>
			</Section>
		</div>
	);
}

export default SettingsRoute;
