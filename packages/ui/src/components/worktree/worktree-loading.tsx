import { Card, CardContent } from "@/components/card";
import { Separator } from "@/components/separator";

export function WorktreeLoading() {
  return (
    <Card>
      <CardContent className="p-0">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <div className="flex items-center gap-4 px-6 py-4">
              <div className="bg-muted size-10 animate-pulse rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="bg-muted h-5 w-40 animate-pulse rounded" />
                <div className="bg-muted h-4 w-64 animate-pulse rounded" />
              </div>
            </div>
            {i < 3 && <Separator />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
