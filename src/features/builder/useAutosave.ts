import { useCallback, useEffect, useRef, useState } from "react";
import { FormSchema, type FormDefinition } from "@/schema/form";
import { ConflictError } from "@/features/forms/api";

export type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict" | "invalid";

export interface AutosaveOptions {
  schema: FormDefinition;
  /** draft_revision of the loaded row. */
  initialRevision: number;
  save: (schema: FormDefinition, expectedRevision: number) => Promise<{ revision: number }>;
  /** Used by "overwrite" after a conflict. */
  fetchRevision: () => Promise<number>;
  delayMs?: number;
  enabled?: boolean;
}

/** Why a draft can't be saved yet (shown instead of silently failing). */
export function unsavableReason(schema: FormDefinition): string | null {
  if (!schema.title.trim()) return "Add a form title to save.";
  const r = FormSchema.safeParse(schema);
  return r.success ? null : `Draft is invalid: ${r.error.issues[0]?.message ?? "unknown problem"}`;
}

/**
 * Debounced autosave with optimistic concurrency. Never reports "saved" unless the
 * backend confirmed the write; conflicts stop autosave until the user decides.
 */
export function useAutosave({ schema, initialRevision, save, fetchRevision, delayMs = 1500, enabled = true }: AutosaveOptions) {
  const serialized = JSON.stringify(schema);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [revision, setRevision] = useState(initialRevision);

  const savedRef = useRef(serialized);       // last content confirmed by the server
  const revRef = useRef(initialRevision);
  const latestRef = useRef({ schema, serialized });
  latestRef.current = { schema, serialized };
  const inFlight = useRef<Promise<boolean> | null>(null);
  const blocked = useRef(false);              // true while in conflict
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async (force = false): Promise<boolean> => {
    if (inFlight.current) { await inFlight.current; }
    const { schema: s, serialized: ser } = latestRef.current;
    if (!force && ser === savedRef.current) { setStatus("saved"); return true; }
    if (blocked.current && !force) return false;
    const reason = unsavableReason(s);
    if (reason) { setStatus("invalid"); setError(reason); return false; }
    setStatus("saving"); setError(null);
    const p = (async () => {
      try {
        const r = await saveRef.current(s, revRef.current);
        revRef.current = r.revision; setRevision(r.revision);
        savedRef.current = ser; setLastSavedAt(new Date()); blocked.current = false;
        setStatus(latestRef.current.serialized === ser ? "saved" : "unsaved");
        return true;
      } catch (e) {
        if (e instanceof ConflictError) { blocked.current = true; setStatus("conflict"); setError(e.message); }
        else { setStatus("error"); setError(e instanceof Error ? e.message : "Save failed"); }
        return false;
      }
    })();
    inFlight.current = p;
    try { return await p; } finally { inFlight.current = null; }
  }, []);

  // Debounce on every content change.
  useEffect(() => {
    if (!enabled || serialized === savedRef.current) return;
    if (blocked.current) return;
    setStatus(s => (s === "saving" ? s : "unsaved"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void run(); }, delayMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [serialized, enabled, delayMs, run]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const dirty = status !== "saved";
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [status]);

  const saveNow = useCallback(() => { if (timer.current) clearTimeout(timer.current); return run(); }, [run]);

  /** After a conflict: take the server's current revision and write this tab's version over it. */
  const overwrite = useCallback(async () => {
    try {
      revRef.current = await fetchRevision();
      blocked.current = false;
      return await run(true);
    } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : "Save failed"); return false; }
  }, [fetchRevision, run]);

  /** Mark content as saved at a given revision (e.g. after loading a version into the draft). */
  const markSaved = useCallback((s: FormDefinition, rev: number) => {
    savedRef.current = JSON.stringify(s); revRef.current = rev; setRevision(rev); blocked.current = false; setStatus("saved"); setError(null);
  }, []);

  const getRevision = useCallback(() => revRef.current, []);

  return { status, error, lastSavedAt, revision, saveNow, overwrite, markSaved, getRevision, isDirty: serialized !== savedRef.current };
}
