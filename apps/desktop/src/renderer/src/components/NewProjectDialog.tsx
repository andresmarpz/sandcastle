import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";

import NewProjectForm from "@/components/NewProjectForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarMenuButton } from "@/components/ui/sidebar";

function NewProjectDialog(): React.JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<>
			<SidebarMenuButton onClick={() => setOpen(true)} tooltip="New project">
				<PlusIcon />
				<span>New project</span>
			</SidebarMenuButton>
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
