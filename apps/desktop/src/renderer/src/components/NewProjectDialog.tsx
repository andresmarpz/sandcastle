import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";

import NewProjectForm from "@/components/NewProjectForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function NewProjectDialog(): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex h-7 w-full items-center gap-2 rounded-md border border-border bg-sidebar px-2 text-left text-xsm text-foreground shadow-[0_1px_1px_rgba(0,0,0,0.03),0_2px_6px_-2px_rgba(0,0,0,0.08)] hover:bg-sidebar-accent dark:shadow-[0_1px_1px_rgba(0,0,0,0.25),0_4px_10px_-3px_rgba(0,0,0,0.35)]"
			>
				<PlusIcon className="size-4 shrink-0 text-foreground-tertiary" />
				<span className="min-w-0 flex-1 truncate">New project</span>
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New project</DialogTitle>
					</DialogHeader>
					<NewProjectForm onSuccess={() => setOpen(false)} />
				</DialogContent>
			</Dialog>
		</>
	);
}

export default NewProjectDialog;
