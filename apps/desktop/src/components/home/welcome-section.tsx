import { Button } from "@sandcastle/ui/components/button";
import { IconPlus, IconFolder } from "@tabler/icons-react";

export function WelcomeSection() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          Welcome to Sandcastle
        </h1>
        <p className="text-muted-foreground text-lg">
          Start building something amazing. Open a recent project or create a
          new one.
        </p>
      </div>

      <div className="flex gap-3">
        <Button>
          <IconPlus data-icon="inline-start" />
          New Project
        </Button>
        <Button variant="outline">
          <IconFolder data-icon="inline-start" />
          Open Project
        </Button>
      </div>
    </section>
  );
}
