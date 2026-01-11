"use client";

import { Route, Routes } from "react-router";
import { useInitialize } from "@/hooks/use-initialize";
import { EmptyState } from "./empty-state";
import { ShellLayout } from "./shell-layout";
import { WorktreeView } from "./worktree-view";

export function RootLayout() {
	useInitialize();

	return (
		<div className="w-full max-h-dvh overflow-y-auto">
			<Routes>
				<Route element={<ShellLayout />}>
					<Route index element={<EmptyState />} />
					<Route
						path="worktrees/:worktreeId/sessions/:sessionId"
						element={<WorktreeView />}
					/>
					<Route path="worktrees/:worktreeId" element={<WorktreeView />} />
				</Route>
			</Routes>
		</div>
	);
}
