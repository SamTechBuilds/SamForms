import { useEffect, useId, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { useNotificationSettings, useSaveNotificationSettings, validateNotificationInput } from "./api";

interface Props {
  formId: string;
  /** Pre-fills the recipient the first time, with the signed-in admin's address. */
  defaultRecipient: string;
}

export function NotificationSettingsCard({ formId, defaultRecipient }: Props) {
  const settings = useNotificationSettings(formId);
  const save = useSaveNotificationSettings(formId);
  const [enabled, setEnabled] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const switchId = useId();
  const inputId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!settings.isSuccess) return;
    setEnabled(settings.data?.enabled ?? false);
    setRecipient(settings.data?.recipient ?? defaultRecipient);
  }, [settings.isSuccess, settings.data, defaultRecipient]);

  async function onSave() {
    const problem = validateNotificationInput({ enabled, recipient });
    setError(problem);
    if (problem) return;
    try {
      await save.mutateAsync({ enabled, recipient });
      toast.success(enabled ? "Notifications are on" : "Notifications are off");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save notification settings.";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="text-base font-semibold">Email notifications</h2>
          <p className="text-sm text-muted-foreground">
            Get an email when someone submits this form. The email says that a response arrived and never includes the answers.
            Emails are sent in batches by the scheduled notification job.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id={switchId}
            aria-labelledby={`${switchId}-label`}
            checked={enabled}
            disabled={settings.isLoading || save.isPending}
            onCheckedChange={setEnabled}
          />
          <Label id={`${switchId}-label`} htmlFor={switchId}>Email me when a response arrives</Label>
        </div>
        <div className="max-w-md space-y-1.5">
          <Label htmlFor={inputId}>Notification recipient</Label>
          <Input
            id={inputId}
            type="email"
            autoComplete="email"
            value={recipient}
            disabled={settings.isLoading || save.isPending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={e => setRecipient(e.target.value)}
          />
          {error && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <Button onClick={() => void onSave()} disabled={settings.isLoading || save.isPending}>
          {save.isPending ? "Saving…" : "Save notification settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
