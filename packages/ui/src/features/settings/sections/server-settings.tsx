"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { getBackendUrlOrDefault, setBackendUrl } from "@/lib/backend-url";

export function ServerSettings() {
	const [url, setUrl] = useState(getBackendUrlOrDefault);

	const handleSaveAndRestart = () => {
		const trimmedUrl = url.trim();
		if (!trimmedUrl) return;
		setBackendUrl(trimmedUrl);
		window.location.reload();
	};

	const currentUrl = getBackendUrlOrDefault();
	const hasChanges = url.trim() !== currentUrl;

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-medium">Server</h2>
				<p className="text-muted-foreground text-sm">
					Configure server connection settings.
				</p>
			</div>

			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="server-url">Backend URL</Label>
					<Input
						id="server-url"
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="http://localhost:3000"
					/>
					<p className="text-muted-foreground text-xs">
						Changing the backend URL requires a restart.
					</p>
				</div>

				<Button onClick={handleSaveAndRestart} disabled={!hasChanges}>
					Save & Restart
				</Button>
			</div>
		</div>
	);
}
