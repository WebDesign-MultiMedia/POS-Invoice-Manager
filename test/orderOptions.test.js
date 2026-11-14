import { describe, expect, it } from "vitest";
import { time12Hour, toTimeInput } from "../src/lib/format.js";
import { isCatering, isSetupCatering } from "../src/lib/orderOptions.js";

describe("order form options", () => {
  it("drop-off time round-trips between the time input and the sheet", () => {
    for (const t of ["00:05", "09:30", "12:00", "14:45", "23:59"]) expect(toTimeInput(time12Hour(t))).toBe(t);
    expect(toTimeInput("2:30 pm")).toBe("14:30");
    expect(toTimeInput("")).toBe("");
    expect(toTimeInput("noon")).toBe("");
  });

  it("knows the catering types, old and new", () => {
    expect(isCatering("Catering")).toBe(true);
    expect(isCatering("Catering - Drop-off")).toBe(true);
    expect(isCatering("Delivery")).toBe(false);
    expect(isSetupCatering("Catering - Setup & pickup later")).toBe(true);
    expect(isSetupCatering("Catering - Drop-off")).toBe(false);
  });
});
