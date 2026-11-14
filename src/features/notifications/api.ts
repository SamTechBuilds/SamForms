import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Mirrors the database rule: an enabled form needs a recipient. Admin RLS is the real gate. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LENGTH = 254;

export interface NotificationSettingsRow {
  form_id: string;
  enabled: boolean;
  recipient: string | null;
}

export function validateNotificationInput(input: { enabled: boolean; recipient: string }): string | null {
  const recipient = input.recipient.trim();
  if (recipient.length > MAX_EMAIL_LENGTH) return "That email address is too long.";
  if (recipient && !EMAIL_PATTERN.test(recipient)) return "Enter a valid email address.";
  if (input.enabled && !recipient) return "Enter an email address to receive notifications.";
  return null;
}

export const notificationKeys = {
  settings: (formId: string) => ["notification-settings", formId] as const,
};

export function useNotificationSettings(formId: string) {
  return useQuery({
    queryKey: notificationKeys.settings(formId),
    enabled: Boolean(formId),
    queryFn: async (): Promise<NotificationSettingsRow | null> => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("form_id,enabled,recipient")
        .eq("form_id", formId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as NotificationSettingsRow | null) ?? null;
    },
  });
}

export function useSaveNotificationSettings(formId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { enabled: boolean; recipient: string }) => {
      const problem = validateNotificationInput(input);
      if (problem) throw new Error(problem);
      const { error } = await supabase
        .from("notification_settings")
        .upsert(
          { form_id: formId, enabled: input.enabled, recipient: input.recipient.trim() || null },
          { onConflict: "form_id" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.settings(formId) }),
  });
}
