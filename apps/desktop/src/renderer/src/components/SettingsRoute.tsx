import { CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { playCue } from "@/lib/activitySounds";
import { cn } from "@/lib/utils";
import { useSoundSettings } from "@/stores/soundSettings";

// Background-terminal keep-alive presets. The persisted value is
// `number | null` (0 = off, N = minutes, null = forever); we key the radio
// items by a stable string since a radio value cannot round-trip `null`.
const KEEP_ALIVE_PRESETS: ReadonlyArray<{
	key: string;
	label: string;
	minutes: number | null;
}> = [
	{ key: "off", label: "Off", minutes: 0 },
	{ key: "5", label: "5 min", minutes: 5 },
	{ key: "30", label: "30 min", minutes: 30 },
	{ key: "60", label: "1 hour", minutes: 60 },
	{ key: "forever", label: "Forever", minutes: null },
];

const presetKeyForMinutes = (minutes: number | null): string => {
	const match = KEEP_ALIVE_PRESETS.find((p) => p.minutes === minutes);
	return match?.key ?? "30";
};

const minutesForPresetKey = (key: string): number | null => {
	const match = KEEP_ALIVE_PRESETS.find((p) => p.key === key);
	return match ? match.minutes : 30;
};

const labelForMinutes = (minutes: number | null): string => {
	const match = KEEP_ALIVE_PRESETS.find((p) => p.minutes === minutes);
	return match?.label ?? "30 min";
};

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

	// `undefined` = not yet loaded; `number | null` = loaded keep-alive value.
	const [keepAliveMinutes, setKeepAliveMinutes] = useState<number | null | undefined>(undefined);

	useEffect(() => {
		let active = true;
		void window.api.terminal.getKeepAliveMinutes().then((value) => {
			if (active) setKeepAliveMinutes(value);
		});
		return () => {
			active = false;
		};
	}, []);

	const changeKeepAlive = (key: string): void => {
		const next = minutesForPresetKey(key);
		setKeepAliveMinutes(next);
		void window.api.terminal.setKeepAliveMinutes(next).then((value) => setKeepAliveMinutes(value));
	};

	const keepAliveLoaded = keepAliveMinutes !== undefined;
	const keepAliveKey = keepAliveLoaded ? presetKeyForMinutes(keepAliveMinutes) : "30";

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
				description="Installs lifecycle hooks in ~/.claude/settings.json so Sandcastle can show precise working / needs-attention / done status and play sounds. The hook is a no-op outside Sandcastle. Disabling removes the hooks."
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

			<Section
				title="Background terminals"
				description="When you quit Sandcastle, terminals and their running processes stay alive in the background and reattach next launch. Choose how long to keep them before cleanup."
			>
				<div className="flex items-center justify-between">
					<span className="text-xs">
						Keep alive after quit
						{!keepAliveLoaded ? <span className="ml-2 text-foreground-tertiary">…</span> : null}
					</span>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="outline"
									size="sm"
									disabled={!keepAliveLoaded}
									aria-label="Background terminal keep-alive duration"
									className="min-w-24 justify-between"
								>
									{keepAliveLoaded ? labelForMinutes(keepAliveMinutes) : "…"}
									<CaretDownIcon className="text-muted-foreground" />
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuRadioGroup value={keepAliveKey} onValueChange={changeKeepAlive}>
								{KEEP_ALIVE_PRESETS.map((preset) => (
									<DropdownMenuRadioItem key={preset.key} value={preset.key}>
										{preset.label}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</Section>
		</div>
	);
}

export default SettingsRoute;
