import { create } from "zustand";
import { persist } from "zustand/middleware";

// Open/closed state for the right-side Review panel (git diffs). Kept in its
// own store rather than the shadcn SidebarProvider context, which is a single
// instance dedicated to the left AppSidebar — sharing it would toggle both
// panels in lockstep. Persisted so the panel survives restarts, mirroring the
// sound/tabs stores' persist pattern.
type ReviewPanelState = {
	open: boolean;
	toggle: () => void;
	setOpen: (open: boolean) => void;
};

export const useReviewPanel = create<ReviewPanelState>()(
	persist(
		(set) => ({
			open: false,
			toggle: () => set((s) => ({ open: !s.open })),
			setOpen: (open) => set({ open }),
		}),
		{
			name: "sandcastle.reviewPanel.v1",
			partialize: (s) => ({ open: s.open }),
		},
	),
);
