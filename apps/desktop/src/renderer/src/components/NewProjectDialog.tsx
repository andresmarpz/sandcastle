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
				aria-label="New project"
				title="New project"
				onClick={() => setOpen(true)}
				className="grid size-7 place-items-center rounded text-foreground-tertiary hover:bg-sidebar-accent/60 hover:text-foreground"
			>
				<PlusIcon className="size-4" />
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
