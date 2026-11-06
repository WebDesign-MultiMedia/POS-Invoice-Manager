// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDemo, endDemo, isDemo, demoApi, DEMO_BRAND } from "../src/lib/demo.js";
import * as sheetdb from "../src/api/sheetdb.js";
import { getBrand, getMenu } from "../src/lib/brand.js";

const fetchSpy = vi.fn(() => Promise.reject(new Error("fetch must not be called in demo mode")));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  startDemo();
});

afterEach(() => {
  endDemo();
  vi.unstubAllGlobals();
});

describe("demo mode", () => {
  it("turns on and off, and survives a reload via localStorage", () => {
    expect(isDemo()).toBe(true);
    expect(localStorage.getItem("pim-demo")).toBe("1");
    endDemo();
    expect(isDemo()).toBe(false);
    expect(localStorage.getItem("pim-demo")).toBeNull();
    expect(localStorage.getItem("pim-demo-data")).toBeNull();
  });

  it("shows the fictional business, not the real one", () => {
    expect(getBrand()).toMatchObject({ name: DEMO_BRAND.name, demo: true });
    expect(JSON.stringify(getMenu())).not.toMatch(/Chivo|Carnitas|Consomé/);
    expect(document.title).toBe(DEMO_BRAND.pageTitle);
  });

  it("answers every data call from the browser and never calls fetch", async () => {
    const orders = await sheetdb.fetchAllOrders();
    expect(orders.length).toBeGreaterThan(0);

    const { id } = await sheetdb.submitOrder({ Name: "Test Customer", Cost: "10", Items: "1x Coffee" });
    const created = await sheetdb.getInvoiceById(id);
    expect(created).toMatchObject({ Id: id, Name: "Test Customer" });

    await sheetdb.recordCardPayment({ InvoiceId: id, Amount: "10.00", Fee: "0.30", Total: "10.30" });
    expect(await sheetdb.getCardPaymentsForInvoice(id)).toHaveLength(1);
    expect((await sheetdb.fetchAllCardPayments()).length).toBeGreaterThan(0);

    expect(await sheetdb.getShareToken(id)).toBe("demo");
    expect((await sheetdb.getSharedInvoice(id, "demo")).invoice.Id).toBe(id);
    expect(await sheetdb.getSharedInvoice("does-not-exist", "demo")).toBeNull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses only made-up sample data (555 phone numbers, example.com emails)", async () => {
    const orders = await demoApi.orders();
    for (const order of orders) expect(order.Contact).toMatch(/^555-01\d\d$/);
    const payments = await demoApi.cardPayments();
    for (const p of payments) {
      if (p.Email) expect(p.Email).toMatch(/@example\.com$/);
      expect(p.PaymentIntentId).toMatch(/^demo_/);
    }
  });

  it("leaving the demo throws away anything created in it", async () => {
    await sheetdb.submitOrder({ Name: "Temp" });
    endDemo();
    startDemo();
    const orders = await demoApi.orders();
    expect(orders.some((o) => o.Name === "Temp")).toBe(false);
  });
});

describe("outside demo mode", () => {
  it("goes through the app's own /api, never an external URL", async () => {
    endDemo();
    fetchSpy.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
    await sheetdb.fetchAllOrders();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/^\/api\/sheets\?/);
  });
});
