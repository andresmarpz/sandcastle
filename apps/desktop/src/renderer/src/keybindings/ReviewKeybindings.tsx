import { useReviewPanel } from "@/stores/reviewPanel";

import { useKeybinding } from "./useKeybinding";

function ReviewKeybindings(): null {
	const toggle = useReviewPanel((s) => s.toggle);
	// The xterm terminal takes focus through a hidden <textarea>, so without
	// ignoreInputs the toggle would silently no-op whenever a pane has focus.
	// Keep it a truly global shortcut, matching ProjectKeybindings.
	useKeybinding("review.toggle", () => toggle(), { ignoreInputs: false });
	return null;
}

export default ReviewKeybindings;
