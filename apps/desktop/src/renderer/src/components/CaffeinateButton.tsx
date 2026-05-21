import { CoffeeIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CaffeinateButton(): React.JSX.Element | null {
	const [enabled, setEnabled] = useState(false);
	const [supported, setSupported] = useState(true);
	const [pending, setPending] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void window.api.caffeinate.get().then((status) => {
			if (cancelled) return;
			setEnabled(status.enabled);
			setSupported(status.supported);
		});
		const off = window.api.caffeinate.onChange((next) => {
			setEnabled(next);
		});
		return () => {
			cancelled = true;
			off();
		};
	}, []);

	if (!supported) return null;

	const toggle = async (): Promise<void> => {
		if (pending) return;
		setPending(true);
		try {
			const status = await window.api.caffeinate.set(!enabled);
			setEnabled(status.enabled);
		} finally {
			setPending(false);
		}
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={enabled ? "Disable keep-awake" : "Enable keep-awake"}
			aria-pressed={enabled}
			title={enabled ? "Keep-awake on" : "Keep-awake off"}
			className="no-drag"
			onClick={() => void toggle()}
		>
			<CoffeeIcon
				weight={enabled ? "fill" : "regular"}
				className={cn(
					"size-4 transition-colors",
					enabled ? "text-foreground" : "text-muted-foreground",
				)}
			/>
		</Button>
	);
}

export default CaffeinateButton;
