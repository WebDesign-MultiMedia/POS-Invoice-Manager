// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDemo, endDemo, isDemo, demoApi, DEMO_BRAND } from "../src/lib/demo.js";
import * as sheetdb from "../src/api/sheetdb.js";
import { getBrand, getMenu } from "../src/lib/brand.js";
import { getCateringMenu } from "../src/lib/cateringMenu.js";
import { createList, loadShopping } from "../src/api/shopping.js";
import { defaultStore } from "../src/lib/shopping.js";

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

  it("the catering calculator uses the demo's own menu", () => {
    const names = JSON.stringify(getCateringMenu());
    expect(names).not.toMatch(/Chivo|Carnitas|Mole|Pernil|charola/i);
    expect(names).toMatch(/Slider Burgers/);
    endDemo();
    expect(JSON.stringify(getCateringMenu())).toMatch(/Carnitas/);
    startDemo();
  });

  it("shopping uses a made-up store and products, never the real ones", async () => {
    const data = await loadShopping();
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/Restaurant Depot|Open Pit|Sirloin|\/imgs\/products\//);
    expect(data.products.length).toBeGreaterThan(0);
    for (const p of data.products) expect(p.store).toBe("Demo Wholesale Club");
    expect(defaultStore()).toBe("Demo Wholesale Club");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaving the demo clears its saved catering quotes", () => {
    localStorage.setItem("pim-catering-quotes-demo", "[1]");
    localStorage.setItem("pim-catering-quotes", "[2]");
    endDemo();
    expect(localStorage.getItem("pim-catering-quotes-demo")).toBeNull();
    expect(localStorage.getItem("pim-catering-quotes")).toBe("[2]"); // the real ones stay
    startDemo();
  });

  it("a new demo starts with fresh shopping lists", async () => {
    await createList({ title: "Temp list", items: [{ name: "x" }] });
    expect((await loadShopping()).lists.some((l) => l.title === "Temp list")).toBe(true);
    endDemo();
    startDemo();
    expect((await loadShopping()).lists.some((l) => l.title === "Temp list")).toBe(false);
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

    const before = (await sheetdb.fetchAllEventSales()).length;
    await sheetdb.recordEventSale({ SaleId: "EV-1", Method: "Cash", Total: "5.00" });
    const sales = await sheetdb.fetchAllEventSales();
    expect(sales).toHaveLength(before + 1);
    expect(sales[0].SaleId).toBe("EV-1");

    const [pay] = await sheetdb.fetchAllCardPayments();
    await sheetdb.updateCardPayment(pay.PaymentIntentId, { Name: "Edited", Total: "0.01" });
    const edited = (await sheetdb.fetchAllCardPayments()).find((p) => p.PaymentIntentId === pay.PaymentIntentId);
    expect(edited.Name).toBe("Edited");
    expect(edited.Total).toBe(pay.Total);
    await sheetdb.deleteCardPayment(pay.PaymentIntentId);
    expect((await sheetdb.fetchAllCardPayments()).some((p) => p.PaymentIntentId === pay.PaymentIntentId)).toBe(false);

    await sheetdb.updateEventSale("EV-1", { Total: "6.00", Name: "Sam" });
    expect((await sheetdb.fetchAllEventSales()).find((r) => r.SaleId === "EV-1")).toMatchObject({ Total: "6.00", Name: "Sam" });
    await sheetdb.deleteEventSale("EV-1");
    expect(await sheetdb.fetchAllEventSales()).toHaveLength(before);

    await sheetdb.updateOrder(id, { Name: "Renamed", Id: "hijack", Date: "01/01/2000" });
    const renamed = await sheetdb.getInvoiceById(id);
    expect(renamed).toMatchObject({ Id: id, Name: "Renamed" });
    expect(renamed.Date).toBe(created.Date);

    expect(await sheetdb.getShareToken(id)).toBe("demo");
    expect((await sheetdb.getSharedInvoice(id, "demo")).invoice.Id).toBe(id);
    expect(await sheetdb.getSharedInvoice("does-not-exist", "demo")).toBeNull();

    await sheetdb.deleteOrder(id);
    expect(await sheetdb.getInvoiceById(id)).toBeNull();
    await expect(sheetdb.deleteOrder(id)).rejects.toMatchObject({ status: 404 });

    expect(fetchSpy).not.toHaveBeenCalled();
    // Every demo call waits 250ms like a real request, and this test makes many.
  }, 20000);

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
