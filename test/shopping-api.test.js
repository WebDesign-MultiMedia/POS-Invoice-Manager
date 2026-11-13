import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFrom, mockReq, mockRes } from "./helpers.js";

// Shopping lists: who can see and change what, and that check marks and
// photos are saved to the right row. SheetDB and Vercel Blob are faked.
const blob = vi.hoisted(() => ({
  put: vi.fn(async (path) => ({ pathname: path.replace("receipt.jpg", "receipt-AbC123.jpg"), url: "https://x.private.blob.vercel-storage.com/p" })),
  del: vi.fn(async () => {}),
  get: vi.fn(async () => ({ statusCode: 200, stream: new Blob([new Uint8Array([1, 2, 3])]).stream(), blob: { contentType: "image/jpeg" } })),
}));
vi.mock("@vercel/blob", () => blob);
const claude = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function Anthropic() {
    return { beta: { messages: { create: claude.create } } };
  }),
}));

const handler = (await import("../api/shopping.js")).default;
const { hashPassword, setSessionCookie } = await import("../api/_lib/auth.js");
const { clearEmployeeCache } = await import("../api/_lib/employees.js");
const { cleanItems } = await import("../api/_lib/shopping.js");

const CARLOS = "3475550123";
const ANA = "3475550124";
const LIST_ID = "s0123456789abcdef0123";
let employees;
let shopping;
let products;
const fetchMock = vi.fn();

const json = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload });

function sheetFetch(url, init = {}) {
  const u = String(url);
  const method = init.method || "GET";
  if (u.includes("sheet=Employees")) return json(employees);
  if (u.includes("sheet=Products")) {
    if (products === null) return json({ error: "Sheet not found" }, 400);
    if (method === "POST") {
      products.push(...JSON.parse(init.body).data);
      return json({ created: 1 });
    }
    const pid = decodeURIComponent(u.match(/ProductId[=/]([^&?]+)/)?.[1] || "");
    if (method === "GET") return json(pid ? products.filter((r) => r.ProductId === pid) : products);
    const prow = products.find((r) => r.ProductId === pid);
    if (!prow) return json({ error: "No results found" }, 404);
    if (method === "PATCH") {
      Object.assign(prow, JSON.parse(init.body).data);
      return json({ updated: 1 });
    }
    products = products.filter((r) => r !== prow);
    return json({ deleted: 1 });
  }
  if (!u.includes("sheet=Shopping")) return json([]);
  if (method === "POST") {
    shopping.push(...JSON.parse(init.body).data);
    return json({ created: 1 });
  }
  const search = u.match(/\/search\?ListId=([^&]+)/)?.[1];
  if (search) return json(shopping.filter((r) => r.ListId === decodeURIComponent(search)));
  if (method === "GET") return json(shopping);
  const id = decodeURIComponent(u.match(/\/ListId\/([^?]+)/)?.[1] || "");
  const row = shopping.find((r) => r.ListId === id);
  if (!row) return json({ error: "No results found" }, 404);
  if (method === "PATCH") {
    Object.assign(row, JSON.parse(init.body).data);
    return json({ updated: 1 });
  }
  shopping = shopping.filter((r) => r !== row);
  return json({ deleted: 1 });
}

const cookieFor = (login, role) => {
  const res = mockRes();
  setSessionCookie(res, login, role);
  return cookieFrom(res);
};
const staff = () => cookieFor("staff@example.com");
const carlos = () => cookieFor(CARLOS, "event");
const ana = () => cookieFor(ANA, "event");

async function call(req) {
  const res = mockRes();
  await handler(mockReq(req), res);
  return res;
}
const list = (cookie) => call({ url: "/api/shopping?action=list", cookie });
const post = (body, cookie) => call({ method: "POST", url: "/api/shopping", body, cookie });
const items = () => JSON.parse(shopping[0].Items);

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword("a long staff test password") }));
  vi.stubEnv("SHEETDB_ID", "test-sheet");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
  claude.create.mockReset();
  employees = [
    { Phone: CARLOS, Name: "Carlos", PinHash: "x:y", Active: "Yes", Access: "shopping" },
    { Phone: ANA, Name: "Ana", PinHash: "x:y", Active: "Yes", Access: "shopping,prices,manage" },
    { Phone: "3475550125", Name: "Luis", PinHash: "x:y", Active: "Yes", Access: "event" },
  ];
  shopping = [
    {
      ListId: LIST_ID,
      Title: "Market",
      AssignedTo: CARLOS,
      AssignedName: "Carlos",
      Status: "Open",
      Items: JSON.stringify(cleanItems([{ id: "iaaaaaa1", name: "Tomatoes", qty: "2 cases", price: "38" }, { id: "iaaaaaa2", name: "Limes", price: "30" }])),
      Receipts: "[]",
      Spent: "",
    },
  ];
  products = [{ ProductId: "p00aa11bb22cc33dd", Name: "Open Pit BBQ Sauce", Size: "1 gallon", Bin: "3002", ItemNo: "25849", Unit: "each", Price: "22.65", CasePrice: "79.99", CaseQty: "4", Photo: "/imgs/products/open-pit-bbq-sauce-gallon.webp" }];
  clearEmployeeCache();
  fetchMock.mockReset().mockImplementation(async (url, init) => sheetFetch(url, init));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.values(blob).forEach((fn) => fn.mockClear());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("who can use Shopping lists", () => {
  it("needs a login with Shopping lists ticked", async () => {
    expect((await list()).statusCode).toBe(401);
    expect((await list(cookieFor("3475550125", "event"))).statusCode).toBe(403);
    expect((await list(carlos())).statusCode).toBe(200);
  });

  it("an employee sees only lists for them or for anyone, without prices", async () => {
    shopping.push({ ...shopping[0], ListId: "s1111111111aaaaaaaaaa", AssignedTo: ANA, Title: "Ana's" }, { ...shopping[0], ListId: "s2222222222aaaaaaaaaa", AssignedTo: "", Title: "Anyone" });
    const res = await list(carlos());
    expect(res.body.lists.map((l) => l.title)).toEqual(["Market", "Anyone"]);
    expect(res.body.lists[0].items.every((i) => i.price === "")).toBe(true);
    expect(res.body.manager).toBe(false);
    expect(res.body.people).toEqual([]);
  });

  it("a manager sees every list, the prices, and who can be given one", async () => {
    const res = await list(ana());
    expect(res.body.manager).toBe(true);
    expect(res.body.lists[0].items[0].price).toBe("38.00");
    expect(res.body.people.map((p) => p.name)).toEqual(["Ana", "Carlos"]);
  });

  it("an employee can make a list, always for themselves, and fix it until it's done", async () => {
    const newList = { title: "From the boss's text", assignedTo: ANA, items: [{ name: "Napkins", store: "BJ's" }] };
    const made = await post({ action: "create", list: newList }, carlos());
    expect(made.statusCode).toBe(200);
    expect(shopping[1]).toMatchObject({ Title: "From the boss's text", AssignedTo: CARLOS, AssignedName: "Carlos", CreatedBy: "Carlos" });
    expect(made.body.list.canEdit).toBe(true);
    const id = made.body.list.id;
    expect((await post({ action: "edit", id, list: { ...newList, title: "Fixed" } }, carlos())).statusCode).toBe(200);
    expect(shopping[1].AssignedTo).toBe(CARLOS);
    // Not someone else's list, and not once it's finished.
    expect((await post({ action: "delete", id: LIST_ID }, carlos())).statusCode).toBe(403);
    await post({ action: "finish", id, spent: "10" }, carlos());
    expect((await post({ action: "edit", id, list: newList }, carlos())).statusCode).toBe(403);
    expect((await post({ action: "delete", id }, carlos())).statusCode).toBe(403);
    expect((await post({ action: "reopen", id }, carlos())).statusCode).toBe(403);
    // A manager still can.
    expect((await post({ action: "delete", id }, ana())).statusCode).toBe(200);
  });

  it("managers make lists for anyone", async () => {
    const res = await post({ action: "create", list: { title: "Paper goods", assignedTo: CARLOS, items: [{ name: "Napkins" }] } }, staff());
    expect(res.statusCode).toBe(200);
    expect(shopping[1]).toMatchObject({ AssignedTo: CARLOS, CreatedBy: "staff@example.com" });
  });

  it("an employee can't touch someone else's list", async () => {
    shopping[0].AssignedTo = ANA;
    expect((await post({ action: "item", id: LIST_ID, itemId: "iaaaaaa1", got: true }, carlos())).statusCode).toBe(404);
  });

  it("a list can only go to someone with Shopping lists", async () => {
    const res = await post({ action: "create", list: { title: "x", assignedTo: "3475550125", items: [{ name: "a" }] } }, staff());
    expect(res.statusCode).toBe(400);
  });
});

describe("a shopping trip", () => {
  it("checks items off and adds extras", async () => {
    expect((await post({ action: "item", id: LIST_ID, itemId: "iaaaaaa1", got: true }, carlos())).statusCode).toBe(200);
    expect((await post({ action: "item", id: LIST_ID, itemId: "iaaaaaa2", got: false, out: true }, carlos())).statusCode).toBe(200);
    expect((await post({ action: "addItem", id: LIST_ID, name: "Ice", qty: "2 bags" }, carlos())).statusCode).toBe(200);
    expect(items().map((i) => [i.name, i.got, i.out, i.extra])).toEqual([
      ["Tomatoes", true, false, false],
      ["Limes", false, true, false],
      ["Ice", true, false, true],
    ]);
  });

  it("a manager's edit keeps what was already checked off", async () => {
    await post({ action: "item", id: LIST_ID, itemId: "iaaaaaa1", got: true }, carlos());
    const edit = { title: "Market", assignedTo: CARLOS, items: [{ id: "iaaaaaa1", name: "Tomatoes", qty: "3 cases", got: false }, { name: "Onions" }] };
    expect((await post({ action: "edit", id: LIST_ID, list: edit }, ana())).statusCode).toBe(200);
    expect(items().map((i) => [i.name, i.qty, i.got])).toEqual([
      ["Tomatoes", "3 cases", true],
      ["Onions", "", false],
    ]);
  });

  it("saves receipt photos privately and serves them only to people who can see the list", async () => {
    const image = `data:image/jpeg;base64,${Buffer.from("fake jpeg").toString("base64")}`;
    const res = await post({ action: "receipt", id: LIST_ID, image }, carlos());
    expect(res.statusCode).toBe(200);
    expect(blob.put).toHaveBeenCalledWith(`receipts/${LIST_ID}/receipt.jpg`, expect.any(Buffer), expect.objectContaining({ access: "private", addRandomSuffix: true }));
    const [photo] = JSON.parse(shopping[0].Receipts);
    expect(photo).toMatchObject({ path: `receipts/${LIST_ID}/receipt-AbC123.jpg`, by: "Carlos" });

    const url = `/api/shopping?action=receipt&id=${LIST_ID}&path=${encodeURIComponent(photo.path)}`;
    const shown = await call({ url, cookie: carlos() });
    expect(shown.statusCode).toBe(200);
    expect(shown.headers["content-type"]).toBe("image/jpeg");
    expect([...shown.body]).toEqual([1, 2, 3]);

    shopping[0].AssignedTo = ANA;
    expect((await call({ url, cookie: carlos() })).statusCode).toBe(404);
    // A path that isn't one of this list's photos is never fetched.
    const other = await call({ url: `/api/shopping?action=receipt&id=${LIST_ID}&path=receipts/other/x.jpg`, cookie: ana() });
    expect(other.statusCode).toBe(404);
    expect(blob.get).toHaveBeenCalledTimes(1);
  });

  it("refuses things that aren't photos", async () => {
    const res = await post({ action: "receipt", id: LIST_ID, image: "data:text/html;base64,PGgxPg==" }, carlos());
    expect(res.statusCode).toBe(400);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("says so when photo storage isn't connected", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    const res = await post({ action: "receipt", id: LIST_ID, image: "data:image/jpeg;base64,AAAA" }, carlos());
    expect(res.statusCode).toBe(400);
    expect((await list(carlos())).body.photos).toBe(false);
  });

  it("finishing needs the receipt total, then locks the list for employees", async () => {
    expect((await post({ action: "finish", id: LIST_ID, spent: "" }, carlos())).statusCode).toBe(400);
    expect((await post({ action: "finish", id: LIST_ID, spent: "$84.37" }, carlos())).statusCode).toBe(200);
    expect(shopping[0]).toMatchObject({ Status: "Done", Spent: "84.37", DoneBy: "Carlos" });
    // Carlos finished it, so he sees what it cost even without "prices".
    expect((await list(carlos())).body.lists[0].spent).toBe("84.37");
    expect((await post({ action: "item", id: LIST_ID, itemId: "iaaaaaa2", got: true }, carlos())).statusCode).toBe(400);
    expect((await post({ action: "reopen", id: LIST_ID }, ana())).statusCode).toBe(200);
    expect(shopping[0].Status).toBe("Open");
  });

  it("deleting a list deletes its photos too", async () => {
    shopping[0].Receipts = JSON.stringify([{ path: `receipts/${LIST_ID}/a.jpg`, by: "Carlos" }]);
    expect((await post({ action: "delete", id: LIST_ID }, ana())).statusCode).toBe(200);
    expect(blob.del).toHaveBeenCalledWith([`receipts/${LIST_ID}/a.jpg`]);
    expect(shopping).toHaveLength(0);
  });

  it("rejects ids that could match other rows", async () => {
    expect((await post({ action: "item", id: "*", itemId: "x" }, staff())).statusCode).toBe(400);
  });
});

describe("reading a receipt photo", () => {
  const PATH = `receipts/${LIST_ID}/receipt-x.jpg`;
  const reply = (obj, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text: JSON.stringify(obj) }] });
  beforeEach(() => {
    shopping[0].Receipts = JSON.stringify([{ path: PATH, at: "2026-11-12T10:00:00Z", by: "Carlos" }]);
    blob.get.mockImplementation(async () => ({ statusCode: 200, stream: new Blob([new Uint8Array([9, 9])]).stream(), blob: { contentType: "image/jpeg" } }));
  });

  it("updates catalog prices from the receipt, using that store's products", async () => {
    // The photo is from Restaurant Depot; the BBQ sauce (in the test catalog) is on it.
    shopping[0].Receipts = JSON.stringify([{ path: PATH, at: "2026-11-12T10:00:00Z", by: "Carlos", store: "Restaurant Depot" }]);
    products.push({ ProductId: "p99aa11bb22cc33dd", Store: "Jetro", Name: "Rice", Unit: "each", Price: "10.00" });
    claude.create.mockResolvedValue(
      reply({
        is_receipt: true,
        store: "Restaurant Depot",
        date: "2026-11-14",
        items: [
          { name: "OPEN PIT BBQ GAL", qty: "2", price: 46.98, size: "1 gal", product_id: "p00aa11bb22cc33dd" },
          { name: "RICE", qty: "1", price: 9, size: "", product_id: "p99aa11bb22cc33dd" },
        ],
        subtotal: 55.98,
        tax: 0,
        total: 55.98,
        note: "",
      })
    );
    const res = await post({ action: "readReceipt", id: LIST_ID, path: PATH }, carlos());
    expect(res.statusCode).toBe(200);
    // Only Restaurant Depot's products were offered to the reader.
    const prompt = claude.create.mock.calls[0][0].messages[0].content[1].text;
    expect(prompt).toContain("p00aa11bb22cc33dd | Open Pit BBQ Sauce");
    expect(prompt).not.toContain("Rice");
    expect(products[0]).toMatchObject({ Price: "23.49", PriceNote: "Price was $22.65 before the 2026-11-14 receipt." });
    expect(products[1].Price).toBe("10.00"); // not offered, so not changed
    expect(res.body.details.catalog).toEqual([{ name: "Open Pit BBQ Sauce", field: "Price", from: "22.65", to: "23.49" }]);
    expect(JSON.parse(shopping[0].Receipts)[0].details.catalog).toHaveLength(1);
  });

  it("saves what the receipt says next to the photo", async () => {
    claude.create.mockResolvedValue(
      reply({ is_receipt: true, store: "Restaurant Depot", date: "2026-11-12", items: [{ name: "Tomatoes", qty: "2", price: 36.5 }, { name: "", qty: "", price: 1 }], subtotal: 36.5, tax: null, total: 36.5, note: "" })
    );
    const res = await post({ action: "readReceipt", id: LIST_ID, path: PATH }, carlos());
    expect(res.statusCode).toBe(200);
    expect(res.body.details).toMatchObject({ store: "Restaurant Depot", total: 36.5, tax: null, items: [{ name: "Tomatoes", qty: "2", price: 36.5 }] });
    expect(JSON.parse(shopping[0].Receipts)[0].details.total).toBe(36.5);
    const sent = claude.create.mock.calls[0][0];
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.output_config.format.type).toBe("json_schema");
    expect(sent.messages[0].content[0].source).toMatchObject({ type: "base64", media_type: "image/jpeg", data: Buffer.from([9, 9]).toString("base64") });
    expect((await list(carlos())).body.lists[0].receipts[0].details.store).toBe("Restaurant Depot");
  });

  it("says so when the photo isn't a readable receipt", async () => {
    claude.create.mockResolvedValue(reply({ is_receipt: false, store: "", date: "", items: [], subtotal: null, tax: null, total: null, note: "" }));
    expect((await post({ action: "readReceipt", id: LIST_ID, path: PATH }, carlos())).statusCode).toBe(400);
    expect(JSON.parse(shopping[0].Receipts)[0].details).toBeUndefined();
  });

  it("keeps the photo when the reader is down", async () => {
    claude.create.mockRejectedValue(new Error("overloaded"));
    const res = await post({ action: "readReceipt", id: LIST_ID, path: PATH }, carlos());
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/photo is saved/);
    expect(JSON.parse(shopping[0].Receipts)).toHaveLength(1);
  });

  it("only reads this list's photos, and only with a key set", async () => {
    expect((await post({ action: "readReceipt", id: LIST_ID, path: "receipts/other/x.jpg" }, carlos())).statusCode).toBe(404);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await post({ action: "readReceipt", id: LIST_ID, path: PATH }, carlos())).statusCode).toBe(400);
    expect((await list(carlos())).body.reader).toBe(false);
    expect(claude.create).not.toHaveBeenCalled();
  });
});

describe("product catalog", () => {
  it("everyone with Shopping sees it, prices only with permission", async () => {
    const res = await list(carlos());
    expect(res.body.catalog).toBe(true);
    expect(res.body.products[0]).toMatchObject({ name: "Open Pit BBQ Sauce", bin: "3002", price: "", casePrice: "", photo: "/imgs/products/open-pit-bbq-sauce-gallon.webp" });
    expect((await list(ana())).body.products[0]).toMatchObject({ price: "22.65", casePrice: "79.99" });
  });

  it("lists still load before the Products tab exists", async () => {
    products = null;
    const res = await list(ana());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ catalog: false, products: [] });
  });

  it("only managers add, change or delete products", async () => {
    const product = { name: "Limes", size: "1 case", unit: "each", price: "$30" };
    expect((await post({ action: "saveProduct", product }, carlos())).statusCode).toBe(403);
    const res = await post({ action: "saveProduct", product }, ana());
    expect(res.statusCode).toBe(200);
    expect(products[1]).toMatchObject({ Name: "Limes", Store: "Restaurant Depot", Price: "30.00", Unit: "each" });
    const id = res.body.product.id;
    expect((await post({ action: "saveProduct", product: { ...product, id, price: "28" } }, ana())).statusCode).toBe(200);
    expect(products[1].Price).toBe("28.00");
    expect((await post({ action: "deleteProduct", id }, carlos())).statusCode).toBe(403);
    expect((await post({ action: "deleteProduct", id }, ana())).statusCode).toBe(200);
    expect(products).toHaveLength(1);
  });

  it("saves an uploaded picture privately, keeping it see-through", async () => {
    const image = `data:image/webp;base64,${Buffer.from("fake webp").toString("base64")}`;
    const res = await post({ action: "saveProduct", product: { name: "Napkins" }, image }, ana());
    expect(res.statusCode).toBe(200);
    expect(blob.put).toHaveBeenCalledWith(expect.stringMatching(/^products\/p[a-f0-9]+\/photo\.webp$/), expect.any(Buffer), expect.objectContaining({ access: "private", contentType: "image/webp" }));
    expect(products[1].Photo).toMatch(/^products\//);
  });

  it("keeps the catalog link on list items", async () => {
    const res = await post({ action: "create", list: { title: "RD", items: [{ name: "Open Pit BBQ Sauce", qty: "2", productId: "p00aa11bb22cc33dd" }, { name: "x", productId: "*" }] } }, ana());
    expect(res.body.list.items.map((i) => i.productId)).toEqual(["p00aa11bb22cc33dd", ""]);
  });
});

describe("a trip to several stores", () => {
  it("keeps which store each item and receipt is for", async () => {
    const items = [
      { name: "BBQ Sauce", store: "Restaurant Depot" },
      { name: "Rice", store: "Jetro" },
      { name: "Ice" },
    ];
    const created = await post({ action: "create", list: { title: "Supply run", items } }, ana());
    expect(created.body.list.items.map((i) => i.store)).toEqual(["Restaurant Depot", "Jetro", ""]);
    const id = created.body.list.id;
    const extra = await post({ action: "addItem", id, name: "Foil", qty: "1", store: "Jetro" }, ana());
    expect(extra.body.list.items.at(-1)).toMatchObject({ name: "Foil", store: "Jetro", extra: true });
    const image = `data:image/jpeg;base64,${Buffer.from("x").toString("base64")}`;
    const photo = await post({ action: "receipt", id, image, store: "Jetro" }, ana());
    expect(photo.body.list.receipts[0].store).toBe("Jetro");
  });
});

describe("saving a product's barcode", () => {
  it("anyone can add a missing barcode; only managers can replace one", async () => {
    products[0].UPC = "";
    expect((await post({ action: "saveBarcode", productId: "p00aa11bb22cc33dd", code: "0 43000 80603 7" }, carlos())).statusCode).toBe(200);
    expect(products[0].UPC).toBe("043000806037");
    expect((await post({ action: "saveBarcode", productId: "p00aa11bb22cc33dd", code: "012345678905" }, carlos())).statusCode).toBe(403);
    expect((await post({ action: "saveBarcode", productId: "p00aa11bb22cc33dd", code: "012345678905" }, ana())).statusCode).toBe(200);
    expect((await post({ action: "saveBarcode", productId: "p00aa11bb22cc33dd", code: "12" }, ana())).statusCode).toBe(400);
  });
});
