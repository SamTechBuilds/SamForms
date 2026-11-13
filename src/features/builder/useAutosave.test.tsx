// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutosave } from "./useAutosave";
import { blankForm } from "./factory";
import { ConflictError } from "@/features/forms/api";
import type { FormDefinition } from "@/schema/form";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const flush = async () => { await act(async () => { await vi.runOnlyPendingTimersAsync(); }); };

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(save: ReturnType<typeof vi.fn>, fetchRevision = vi.fn(async () => 7)) {
    const initial = blankForm("Draft");
    const hook = renderHook(({ schema }: { schema: FormDefinition }) =>
      useAutosave({ schema, initialRevision: 0, save, fetchRevision, delayMs: 1000 }), { initialProps: { schema: initial } });
    return { hook, initial, fetchRevision };
  }

  it("debounces edits into one save and reports saved only after the backend confirms", async () => {
    let resolve!: (v: { revision: number }) => void;
    const save = vi.fn<(s: FormDefinition, rev: number) => Promise<{ revision: number }>>(() => new Promise(r => { resolve = r; }));
    const { hook, initial } = setup(save);
    expect(hook.result.current.status).toBe("saved");
    hook.rerender({ schema: { ...initial, title: "A" } });
    hook.rerender({ schema: { ...initial, title: "AB" } });
    expect(hook.result.current.status).toBe("unsaved");
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].title).toBe("AB");
    expect(save.mock.calls[0]![1]).toBe(0);
    expect(hook.result.current.status).toBe("saving");
    await act(async () => { resolve({ revision: 1 }); });
    expect(hook.result.current.status).toBe("saved");
    expect(hook.result.current.revision).toBe(1);
  });

  it("sends the latest revision on the next save", async () => {
    const save = vi.fn(async (_s: FormDefinition, rev: number) => ({ revision: rev + 1 }));
    const { hook, initial } = setup(save);
    hook.rerender({ schema: { ...initial, title: "One" } }); await flush();
    hook.rerender({ schema: { ...initial, title: "Two" } }); await flush();
    expect(save.mock.calls.map(c => c[1])).toEqual([0, 1]);
  });

  it("surfaces errors without claiming success", async () => {
    const save = vi.fn(async () => { throw new Error("network down"); });
    const { hook, initial } = setup(save);
    hook.rerender({ schema: { ...initial, title: "X" } }); await flush();
    expect(hook.result.current.status).toBe("error");
    expect(hook.result.current.error).toBe("network down");
  });

  it("stops on conflict and can overwrite using the server revision", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new ConflictError())
      .mockImplementation(async (...args: [FormDefinition, number]) => ({ revision: args[1] + 1 }));
    const { hook, initial, fetchRevision } = setup(save);
    hook.rerender({ schema: { ...initial, title: "Mine" } }); await flush();
    expect(hook.result.current.status).toBe("conflict");
    hook.rerender({ schema: { ...initial, title: "Mine 2" } }); await flush();
    expect(save).toHaveBeenCalledTimes(1); // autosave paused while in conflict
    await act(async () => { await hook.result.current.overwrite(); });
    expect(fetchRevision).toHaveBeenCalled();
    expect(save.mock.calls[1]![1]).toBe(7);
    expect(hook.result.current.status).toBe("saved");
  });

  it("refuses to save an untitled draft and explains why", async () => {
    const save = vi.fn<(s: FormDefinition, rev: number) => Promise<{ revision: number }>>();
    const { hook, initial } = setup(save);
    hook.rerender({ schema: { ...initial, title: "   " } }); await flush();
    expect(save).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe("invalid");
    expect(hook.result.current.error).toMatch(/title/);
  });

  it("saveNow flushes immediately", async () => {
    const save = vi.fn(async () => ({ revision: 1 }));
    const { hook, initial } = setup(save);
    hook.rerender({ schema: { ...initial, title: "Now" } });
    await act(async () => { await hook.result.current.saveNow(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe("saved");
  });
});
