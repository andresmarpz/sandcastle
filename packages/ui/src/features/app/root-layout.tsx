"use client";

import { Route, Routes } from "react-router";

import { EmptyState } from "./empty-state";
import { ShellLayout } from "./shell-layout";
import { WorktreeView } from "./worktree-view";

export function RootLayout() {
	return (
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
	);
}
