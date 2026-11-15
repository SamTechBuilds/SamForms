// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RankingInput } from "./inputs";
import { createQuestion } from "@/features/builder/factory";
import { isPermutationOfOptions } from "../definitions";
import { fieldRegistry, resolveConfig } from "../registry";

const make = (randomize = false) => {
  const q = { ...createQuestion("ranking", "s1"), id: "q1", options: [
    { id: "a", label: "Apples", value: "apples" },
    { id: "b", label: "Bananas", value: "bananas" },
    { id: "c", label: "Cherries", value: "cherries" },
  ] };
  return { q, config: { ...q.config, randomize } };
};

describe("RankingInput", () => {
  it("defaults to a complete order and reports it on mount", () => {
    const { q, config } = make(false);
    const onChange = vi.fn();
    render(<RankingInput question={q} config={config} value={undefined} onChange={onChange} inputId="q1" />);
    expect(onChange).toHaveBeenCalledWith(["apples", "bananas", "cherries"]);
  });

  it("moves an item down and reports the new order", () => {
    const { q, config } = make(false);
    const onChange = vi.fn();
    render(<RankingInput question={q} config={config} value={["apples", "bananas", "cherries"]} onChange={onChange} inputId="q1" />);
    fireEvent.click(screen.getByRole("button", { name: "Move Apples down" }));
    expect(onChange).toHaveBeenLastCalledWith(["bananas", "apples", "cherries"]);
  });

  it("disables Up on the first item and Down on the last", () => {
    const { q, config } = make(false);
    render(<RankingInput question={q} config={config} value={["apples", "bananas", "cherries"]} onChange={() => {}} inputId="q1" />);
    expect(screen.getByRole("button", { name: "Move Apples up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Cherries down" })).toBeDisabled();
  });

  it("ignores a stored value that is not a permutation of the options", () => {
    const { q, config } = make(false);
    const onChange = vi.fn();
    render(<RankingInput question={q} config={config} value={["apples", "apples", "cherries"]} onChange={onChange} inputId="q1" />);
    expect(onChange).toHaveBeenCalledWith(["apples", "bananas", "cherries"]);
  });
});

describe("ranking validation", () => {
  it("accepts only an exact permutation of the option values", () => {
    const { q } = make();
    const check = isPermutationOfOptions(q);
    expect(check(["cherries", "apples", "bananas"])).toBe(true);
    expect(check(["apples", "apples", "bananas"])).toBe(false);
    expect(check(["apples", "bananas"])).toBe(false);
    expect(check(["apples", "bananas", "kiwi"])).toBe(false);
  });

  it("the answer schema rejects an incomplete ranking", () => {
    const { q } = make();
    const schema = fieldRegistry.ranking.answerSchema(q, resolveConfig(q));
    expect(schema!.safeParse(["apples", "bananas", "cherries"]).success).toBe(true);
    expect(schema!.safeParse(["apples"]).success).toBe(false);
  });
});
