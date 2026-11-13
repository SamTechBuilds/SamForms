import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./PageHeader";

/** Explicit "not yet implemented" page (no fake functionality). */
export function ComingSoonPage({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Badge variant="warning">Not yet implemented — Phase {phase}</Badge>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </>
  );
}
