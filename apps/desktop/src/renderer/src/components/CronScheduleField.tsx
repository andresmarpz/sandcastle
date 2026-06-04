import { ClockIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CronSchedule = {
	/** Five-field cron expression: `minute hour day-of-month month day-of-week`. */
	expression: string;
	/** Human-readable summary, e.g. "Every day at 09:00". */
	description: string;
	valid: boolean;
};

type Freq = "minutes" | "hourly" | "daily" | "weekly" | "custom";

type FormState = {
	freq: Freq;
	stepMinutes: number;
	hourlyMinute: number;
	time: string;
	days: number[];
	custom: string;
};

const FREQS: { id: Freq; label: string }[] = [
	{ id: "minutes", label: "Minutes" },
	{ id: "hourly", label: "Hourly" },
	{ id: "daily", label: "Daily" },
	{ id: "weekly", label: "Weekly" },
	{ id: "custom", label: "Custom" },
];

const STEP_OPTIONS = [5, 10, 15, 30];
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// Five non-whitespace fields separated by whitespace.
const CRON_RE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

const pad = (n: number): string => String(n).padStart(2, "0");
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const clampMinute = (n: number): number =>
	Math.max(0, Math.min(59, Math.trunc(Number.isFinite(n) ? n : 0)));

function parseTime(value: string): [number, number] {
	const [h, m] = value.split(":");
	const hour = Number(h);
	const minute = Number(m);
	return [Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0];
}

function describeDays(days: number[]): string {
	if (days.length === 0) return "no days";
	const sorted = [...days].sort((a, b) => a - b);
	if (sorted.length === 7) return "every day";
	if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return "weekdays";
	if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return "weekends";
	return sorted.map((d) => DOW_LABELS[d]).join(", ");
}

/** Pure derivation of the cron expression + summary from the form state. */
function buildSchedule(s: FormState): CronSchedule {
	switch (s.freq) {
		case "minutes":
			return {
				expression: `*/${s.stepMinutes} * * * *`,
				description: `Every ${s.stepMinutes} minutes`,
				valid: true,
			};
		case "hourly": {
			const m = clampMinute(s.hourlyMinute);
			return { expression: `${m} * * * *`, description: `Hourly at :${pad(m)}`, valid: true };
		}
		case "daily": {
			const [h, m] = parseTime(s.time);
			return {
				expression: `${m} ${h} * * *`,
				description: `Every day at ${pad(h)}:${pad(m)}`,
				valid: true,
			};
		}
		case "weekly": {
			const [h, m] = parseTime(s.time);
			const valid = s.days.length > 0;
			const d = valid ? [...s.days].sort((a, b) => a - b).join(",") : "*";
			return {
				expression: `${m} ${h} * * ${d}`,
				description: `${capitalize(describeDays(s.days))} at ${pad(h)}:${pad(m)}`,
				valid,
			};
		}
		default: {
			const expr = s.custom.trim();
			return { expression: expr, description: "Custom cron expression", valid: CRON_RE.test(expr) };
		}
	}
}

/** The schedule a freshly mounted field reports — keep parent defaults in sync. */
export const DEFAULT_SCHEDULE: CronSchedule = buildSchedule({
	freq: "daily",
	stepMinutes: 15,
	hourlyMinute: 0,
	time: "09:00",
	days: [1, 2, 3, 4, 5],
	custom: "0 9 * * *",
});

function Segmented({
	value,
	onChange,
}: {
	value: Freq;
	onChange: (next: Freq) => void;
}): React.JSX.Element {
	return (
		<div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
			{FREQS.map((opt) => (
				<button
					key={opt.id}
					type="button"
					onClick={() => onChange(opt.id)}
					className={cn(
						"flex-1 rounded-md px-2 py-1 text-xsm font-medium transition-colors",
						value === opt.id
							? "bg-background text-foreground shadow-elevated"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

type Props = {
	onChange: (schedule: CronSchedule) => void;
};

function CronScheduleField({ onChange }: Props): React.JSX.Element {
	const [freq, setFreq] = useState<Freq>("daily");
	const [stepMinutes, setStepMinutes] = useState(15);
	const [hourlyMinute, setHourlyMinute] = useState(0);
	const [time, setTime] = useState("09:00");
	const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
	const [custom, setCustom] = useState("0 9 * * *");

	const form: FormState = { freq, stepMinutes, hourlyMinute, time, days, custom };
	const schedule = buildSchedule(form);

	// Report the freshly derived schedule from the same event that changed an
	// input — no effect needed, and the parent never sees a stale value.
	const emit = (patch: Partial<FormState>): void => onChange(buildSchedule({ ...form, ...patch }));

	const selectFreq = (next: Freq): void => {
		setFreq(next);
		emit({ freq: next });
	};
	const selectStep = (next: number): void => {
		setStepMinutes(next);
		emit({ stepMinutes: next });
	};
	const changeMinute = (raw: number): void => {
		const next = clampMinute(raw);
		setHourlyMinute(next);
		emit({ hourlyMinute: next });
	};
	const changeTime = (next: string): void => {
		setTime(next);
		emit({ time: next });
	};
	const changeCustom = (next: string): void => {
		setCustom(next);
		emit({ custom: next });
	};
	const toggleDay = (idx: number): void => {
		const next = days.includes(idx) ? days.filter((d) => d !== idx) : [...days, idx];
		setDays(next);
		emit({ days: next });
	};

	return (
		<div className="flex flex-col gap-3">
			<Segmented value={freq} onChange={selectFreq} />

			<div className="rounded-lg border border-border bg-muted/30 p-3">
				{freq === "minutes" ? (
					<div className="flex items-center gap-2 text-xsm">
						<span className="text-muted-foreground">Run every</span>
						<div className="flex gap-1">
							{STEP_OPTIONS.map((n) => (
								<button
									key={n}
									type="button"
									onClick={() => selectStep(n)}
									className={cn(
										"h-7 min-w-9 rounded-md border px-2 font-medium tabular-nums transition-colors",
										stepMinutes === n
											? "border-primary bg-primary/10 text-foreground"
											: "border-border text-muted-foreground hover:bg-muted",
									)}
								>
									{n}
								</button>
							))}
						</div>
						<span className="text-muted-foreground">minutes</span>
					</div>
				) : null}

				{freq === "hourly" ? (
					<div className="flex items-center gap-2 text-xsm">
						<span className="text-muted-foreground">At minute</span>
						<Input
							type="number"
							min={0}
							max={59}
							value={hourlyMinute}
							onChange={(e) => changeMinute(Number(e.target.value))}
							className="h-7 w-16 tabular-nums"
							aria-label="Minute of the hour"
						/>
						<span className="text-muted-foreground">of every hour</span>
					</div>
				) : null}

				{freq === "daily" ? (
					<div className="flex items-center gap-2 text-xsm">
						<span className="text-muted-foreground">At</span>
						<Input
							type="time"
							value={time}
							onChange={(e) => changeTime(e.target.value)}
							className="h-7 w-28 tabular-nums"
							aria-label="Time of day"
						/>
					</div>
				) : null}

				{freq === "weekly" ? (
					<div className="flex flex-col gap-2.5">
						<div className="flex gap-1">
							{DOW_LABELS.map((fullName, idx) => {
								const active = days.includes(idx);
								return (
									<button
										key={fullName}
										type="button"
										aria-pressed={active}
										title={fullName}
										onClick={() => toggleDay(idx)}
										className={cn(
											"size-7 rounded-md border text-xsm font-medium transition-colors",
											active
												? "border-primary bg-primary/10 text-foreground"
												: "border-border text-muted-foreground hover:bg-muted",
										)}
									>
										{DOW_INITIALS[idx]}
									</button>
								);
							})}
						</div>
						<div className="flex items-center gap-2 text-xsm">
							<span className="text-muted-foreground">At</span>
							<Input
								type="time"
								value={time}
								onChange={(e) => changeTime(e.target.value)}
								className="h-7 w-28 tabular-nums"
								aria-label="Time of day"
							/>
						</div>
					</div>
				) : null}

				{freq === "custom" ? (
					<div className="flex flex-col gap-1.5">
						<Input
							value={custom}
							onChange={(e) => changeCustom(e.target.value)}
							placeholder="0 9 * * *"
							spellCheck={false}
							className={cn("h-8 font-mono", !schedule.valid && "border-destructive")}
							aria-label="Cron expression"
						/>
						<p className="text-xs text-muted-foreground">
							Five fields: minute, hour, day of month, month, day of week.
						</p>
					</div>
				) : null}
			</div>

			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5 text-xsm text-muted-foreground">
					<ClockIcon className="size-3.5 shrink-0" />
					<span className="truncate">
						{schedule.valid ? schedule.description : "Enter a valid 5-field cron expression"}
					</span>
				</div>
				<code
					className={cn(
						"shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.7rem]",
						schedule.valid
							? "border-border bg-background text-foreground"
							: "border-destructive/40 bg-destructive/10 text-destructive",
					)}
				>
					{schedule.expression || "—"}
				</code>
			</div>
		</div>
	);
}

export default CronScheduleField;
