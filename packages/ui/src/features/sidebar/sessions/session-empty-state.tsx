"use client";

import { IconMessage2Plus } from "@tabler/icons-react";
import { Button } from "@/components/button";
import { Spinner } from "@/components/spinner";

interface SessionEmptyStateProps {
	onCreate: () => void;
	isCreating?: boolean;
}

export function SessionEmptyState({
	onCreate,
	isCreating,
}: SessionEmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<div className="rounded-full bg-muted p-3 mb-4">
				<IconMessage2Plus className="size-6 text-muted-foreground" />
			</div>
			<h3 className="text-sm font-medium mb-1">No sessions yet</h3>
			<p className="text-muted-foreground text-xs max-w-[200px] mb-4">
				Start a new session to begin working with Claude on this repository.
			</p>
			<Button size="sm" onClick={onCreate} disabled={isCreating}>
				{isCreating ? (
					<>
						<Spinner className="size-4" />
						Creating...
					</>
				) : (
					<>
						<IconMessage2Plus className="size-4" />
						New session
					</>
				)}
			</Button>
		</div>
	);
}
