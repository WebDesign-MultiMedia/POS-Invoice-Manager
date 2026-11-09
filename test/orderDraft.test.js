// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { hasDraft, isBlankForm, readDraft, writeDraft } from "../src/lib/orderDraft.js";

beforeEach(() => sessionStorage.clear());

describe("order form draft", () => {
  it("a new form with only the 0 deposit isn't a draft", () => {
    expect(isBlankForm({ Name: "", Deposit: "0", Cost: "" })).toBe(true);
    writeDraft({ Name: "", Deposit: "0" });
    expect(readDraft()).toBeNull();
    expect(hasDraft()).toBe(false);
  });

  it("anything typed, including a real deposit, is kept", () => {
    expect(isBlankForm({ Name: "", Deposit: "20" })).toBe(false);
    writeDraft({ Name: "Ana", Deposit: "0" });
    expect(readDraft()).toEqual({ Name: "Ana", Deposit: "0" });
    expect(hasDraft()).toBe(true);
  });
});
