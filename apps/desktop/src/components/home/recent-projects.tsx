import * as React from "react";
import { Card, CardContent } from "@sandcastle/ui/components/card";
import { Button } from "@sandcastle/ui/components/button";
import { Separator } from "@sandcastle/ui/components/separator";
import { IconFolder, IconClock, IconDotsVertical } from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sandcastle/ui/components/dropdown-menu";
import type { Project } from "@/types/project";

interface RecentProjectsProps {
  projects: Project[];
}

export function RecentProjects({ projects }: RecentProjectsProps) {
  if (projects.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-foreground text-xl font-medium">Recent Projects</h2>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No recent projects. Create or open a project to get started.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-foreground text-xl font-medium">Recent Projects</h2>
      <Card>
        <CardContent className="p-0">
          {projects.map((project, index) => (
            <React.Fragment key={project.id}>
              <ProjectItem project={project} />
              {index < projects.length - 1 && <Separator />}
            </React.Fragment>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ProjectItem({ project }: { project: Project }) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(project.lastOpened);

  return (
    <div className="hover:bg-muted/50 group flex items-center gap-4 px-6 py-4 transition-colors">
      <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
        <IconFolder className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-foreground truncate font-medium">{project.name}</h3>
        {project.description && (
          <p className="text-muted-foreground truncate text-sm">
            {project.description}
          </p>
        )}
        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          <IconClock className="size-3" />
          {formattedDate}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 group-hover:opacity-100"
            />
          }
        >
          <IconDotsVertical className="size-4" />
          <span className="sr-only">Project options</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Open</DropdownMenuItem>
          <DropdownMenuItem>Open in New Window</DropdownMenuItem>
          <DropdownMenuItem>Copy Path</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">
            Remove from Recent
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
