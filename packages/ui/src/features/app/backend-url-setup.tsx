"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { DEFAULT_BACKEND_URL, setBackendUrl } from "@/lib/backend-url";

export function BackendUrlSetup() {
	const [url, setUrl] = useState(DEFAULT_BACKEND_URL);

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		const trimmedUrl = url.trim();
		if (!trimmedUrl) return;
		setBackendUrl(trimmedUrl);
		window.location.reload();
	};

	const handleUseDefault = () => {
		setBackendUrl(DEFAULT_BACKEND_URL);
		window.location.reload();
	};

	return (
		<div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
			<div className="w-full max-w-md space-y-6 p-6">
				<div className="space-y-2 text-center">
					<h1 className="text-2xl font-semibold tracking-tight">
						Welcome to Sandcastle
					</h1>
					<p className="text-muted-foreground text-sm">
						Enter your Sandcastle backend URL to get started.
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="backend-url">Backend URL</Label>
						<Input
							id="backend-url"
							type="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="http://localhost:3000"
							autoFocus
						/>
					</div>

					<div className="flex gap-3">
						<Button
							type="button"
							variant="outline"
							className="flex-1"
							onClick={handleUseDefault}
						>
							Use Default
						</Button>
						<Button type="submit" className="flex-1">
							Connect
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
