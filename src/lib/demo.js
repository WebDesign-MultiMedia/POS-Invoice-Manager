// Demo mode: lets recruiters and visitors try the whole POS without a staff
// login. Everything runs in the browser on made-up sample data for a
// fictional business; nothing reaches the real sheet, Stripe or Twilio.
//
// The flag and the sample data live in localStorage (not just memory) so
// links that open in a new tab — e.g. "Generate Invoice" — stay in the
// demo. Leaving the demo clears both. If storage is blocked (private mode),
// it all still works for the current tab from memory.
//
// Security: demo mode only swaps the browser's data layer. It grants no
// server access — every /api endpoint still requires a real staff session.
import { ApiError } from "./errors.js";

const FLAG_KEY = "pim-demo";
const DATA_KEY = "pim-demo-data";

let memoryFlag = false;
let memoryData = null;
// The page title names the real restaurant, so the demo swaps it out.
const REAL_TITLE = typeof document !== "undefined" ? document.title : "";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: memory copy is used instead.
  }
}

export function isDemo() {
  return memoryFlag || read(FLAG_KEY) === "1";
}

export function startDemo() {
  memoryFlag = true;
  memoryData = null;
  write(FLAG_KEY, "1");
  write(DATA_KEY, null);
  document.title = DEMO_BRAND.pageTitle;
}

export function endDemo() {
  if (isDemo()) document.title = REAL_TITLE;
  memoryFlag = false;
  memoryData = null;
  write(FLAG_KEY, null);
  write(DATA_KEY, null);
}

// ---------- Fictional business shown in the demo ----------
export const DEMO_BRAND = {
  name: "Demo Café",
  tagline: "Sample restaurant • Live demo",
  shortTagline: "Sample restaurant",
  location: "123 Example St, Anytown",
  pageTitle: "Demo | POS-Invoice-Manager",
  smsPrefix: "Demo Café: ",
};

// Generic sample menu for Event Sales in the demo.
export const DEMO_MENU = [
  {
    category: "Mains",
    items: [
      { id: "demo-burger", name: "Classic Burger", price: 11 },
      { id: "demo-veggie", name: "Veggie Burger", price: 10 },
      { id: "demo-wrap", name: "Chicken Wrap", price: 9.5 },
      { id: "demo-salad", name: "Garden Salad", price: 8 },
    ],
  },
  {
    category: "Sides",
    items: [
      { id: "demo-fries", name: "Fries", price: 4 },
      { id: "demo-soup", name: "Soup of the Day", price: 5 },
    ],
  },
  {
    category: "Drinks",
    items: [
      { id: "demo-lemonade", name: "Lemonade", price: 3.5 },
      { id: "demo-coffee", name: "Coffee", price: 2.5 },
      { id: "demo-tea", name: "Iced Tea", price: 3 },
    ],
  },
];

// ---------- Sample data ----------
const pad = (n) => String(n).padStart(2, "0");
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
}
function cpId(n, time) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `CP-${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${time}`;
}

function seed() {
  const orders = [
    ["Alex Rivera", "555-0101", "12 Maple Ave", "Delivery", "2x Classic Burger, 2x Fries, 2x Lemonade", "37.00", "10", "Cash", 0, "11:42 AM", "No onions on one burger"],
    ["Jordan Lee", "555-0102", "48 Oak St", "Pick-up", "1x Veggie Burger, 1x Garden Salad", "18.00", "0", "Zelle", 1, "12:15 PM", ""],
    ["Sam Patel", "555-0103", "7 Birch Rd", "Catering", "20x Chicken Wrap, 10x Garden Salad, 2x Lemonade pitcher", "290.00", "100", "Zelle", 2, "9:30 AM", "Office lunch — deliver by noon"],
    ["Taylor Brooks", "555-0104", "301 Pine Ln", "Delivery", "3x Soup of the Day, 3x Coffee", "22.50", "0", "Cash", 3, "6:05 PM", ""],
    ["Morgan Diaz", "555-0105", "55 Cedar Ct", "Pick-up", "1x Classic Burger, 1x Fries, 1x Iced Tea", "18.00", "0", "Cash", 5, "1:20 PM", ""],
    ["Casey Nguyen", "555-0106", "9 Elm St", "Catering", "15x Classic Burger, 15x Fries", "225.00", "75", "Zelle", 8, "10:00 AM", "Birthday party"],
    ["Riley Chen", "555-0107", "160 Willow Way", "Delivery", "2x Chicken Wrap, 2x Soup of the Day", "29.00", "0", "Cash", 12, "7:45 PM", ""],
    ["Jamie Owens", "555-0108", "22 Spruce Dr", "Pick-up", "4x Coffee, 2x Garden Salad", "26.00", "0", "Zelle", 18, "8:10 AM", ""],
    ["Avery Scott", "555-0109", "81 Aspen Blvd", "Delivery", "1x Veggie Burger, 1x Fries, 1x Lemonade", "17.50", "5", "Cash", 25, "5:30 PM", ""],
    ["Drew Martin", "555-0110", "4 Poplar Pl", "Catering", "30x Chicken Wrap, 30x Iced Tea", "375.00", "150", "Zelle", 33, "11:00 AM", "School event"],
    ["Alex Rivera", "555-0101", "12 Maple Ave", "Pick-up", "1x Classic Burger, 1x Coffee", "13.50", "0", "Cash", 41, "12:50 PM", ""],
    ["Quinn Harper", "555-0111", "290 Chestnut St", "Delivery", "2x Garden Salad, 2x Soup of the Day", "26.00", "0", "Cash", 52, "6:40 PM", ""],
  ].map(([Name, Contact, Address, PickupDelivery, Items, Cost, Deposit, Payment, ago, Time, Notes], i) => ({
    Id: String(1001 + i),
    Date: daysAgo(ago),
    Time,
    Name,
    Contact,
    Address,
    PickupDelivery,
    Items,
    Quantity: "",
    Cost,
    Deposit,
    Payment,
    DueDate: PickupDelivery === "Catering" ? daysAgo(ago - 3) : "",
    Notes,
  }));

  const cardPayments = [
    {
      InvoiceId: "1003",
      Date: daysAgo(1),
      Time: "3:12 PM",
      Name: "Sam Patel",
      Phone: "555-0103",
      Email: "sam@example.com",
      Amount: "90.00",
      Fee: "2.70",
      Total: "92.70",
      Funding: "credit",
      Card: "Visa •••• 4242",
      PaymentIntentId: "demo_pi_1",
      Items: "",
      Note: "",
    },
    {
      InvoiceId: cpId(0, "121530"),
      Date: daysAgo(0),
      Time: "12:15 PM",
      Name: "Walk-up customer",
      Phone: "",
      Email: "",
      Amount: "18.00",
      Fee: "0.00",
      Total: "18.00",
      Funding: "debit",
      Card: "Visa •••• 5556",
      PaymentIntentId: "demo_pi_2",
      Items: "1x Classic Burger ($11.00)\n1x Fries ($4.00)\n1x Iced Tea ($3.00)",
      Note: "Farmers market stand",
    },
  ];

  const sale = (time, Name, Items, Amount, Method, extra = {}) => ({
    Date: daysAgo(0),
    Time: time,
    SaleId: cpId(0, time.replace(/\D/g, "").padStart(4, "0") + "00").replace("CP-", "EV-"),
    Name,
    Items,
    Note: "",
    Amount,
    Fee: "0.00",
    Total: Amount,
    Method,
    CashReceived: "",
    Change: "",
    Card: "",
    Funding: "",
    PaymentIntentId: "",
    ...extra,
  });
  const eventSales = [
    sale("10:05 AM", "", "2x Classic Burger ($22.00)\n2x Lemonade ($7.00)", "29.00", "Cash", { CashReceived: "40.00", Change: "11.00" }),
    sale("10:20 AM", "Pat", "1x Chicken Wrap ($9.50)\n1x Coffee ($2.50)", "12.00", "Zelle"),
    sale("10:42 AM", "", "1x Veggie Burger ($10.00)\n1x Fries ($4.00)", "14.00", "Card", {
      Fee: "0.42",
      Total: "14.42",
      Card: "Visa •••• 4242",
      Funding: "credit",
      PaymentIntentId: "demo_pi_3",
    }),
  ];

  return { orders, cardPayments, eventSales, nextId: 1001 + orders.length };
}

function load() {
  if (memoryData) return memoryData;
  try {
    const saved = JSON.parse(read(DATA_KEY));
    if (saved && Array.isArray(saved.orders)) memoryData = saved;
  } catch {
    // Corrupt or missing: start fresh below.
  }
  if (!memoryData) {
    memoryData = seed();
    save();
  }
  return memoryData;
}
function save() {
  write(DATA_KEY, JSON.stringify(memoryData));
}

// Same shapes the real /api/sheets returns, so pages don't know the difference.
const notFound = () => Promise.reject(new ApiError(404, "Not found"));

// Edits one demo row by its key, leaving the `locked` fields as they were.
function updateRow(list, key, id, data, locked) {
  const db = load();
  const row = (db[list] || []).find((r) => String(r[key]) === String(id));
  if (!row) return notFound();
  for (const [field, value] of Object.entries(data || {})) if (!locked.includes(field)) row[field] = value;
  save();
  return later({ updated: 1 });
}

function deleteRow(list, key, id) {
  const db = load();
  const rows = db[list] || [];
  const kept = rows.filter((r) => String(r[key]) !== String(id));
  if (kept.length === rows.length) return notFound();
  db[list] = kept;
  save();
  return later({ deleted: 1 });
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const later = (v) => new Promise((resolve) => setTimeout(() => resolve(clone(v)), 250));

export const demoApi = {
  orders: () => later(load().orders.slice().reverse()),
  order: (id) => later(load().orders.filter((o) => o.Id === String(id).trim())),
  createOrder(data) {
    const db = load();
    const row = { ...data, Id: String(db.nextId++) };
    db.orders.push(row);
    save();
    return later({ created: 1, id: row.Id });
  },
  updateOrder: (id, data) => updateRow("orders", "Id", id, data, ["Id", "Date", "Time"]),
  deleteOrder: (id) => deleteRow("orders", "Id", id),
  updateCardPayment: (id, data) =>
    updateRow("cardPayments", "PaymentIntentId", id, data, ["PaymentIntentId", "Date", "Time", "Amount", "Fee", "Total", "Card", "Funding"]),
  deleteCardPayment: (id) => deleteRow("cardPayments", "PaymentIntentId", id),
  updateEventSale(id, data) {
    const sale = (load().eventSales || []).find((r) => r.SaleId === String(id));
    const locked = ["SaleId", "Date", "Time", "Fee", "Card", "Funding", "PaymentIntentId"];
    if (sale?.Method === "Card") locked.push("Method", "Amount", "Total", "CashReceived", "Change");
    return updateRow("eventSales", "SaleId", id, data, locked);
  },
  deleteEventSale: (id) => deleteRow("eventSales", "SaleId", id),
  payEventSale(id, data) {
    const sale = (load().eventSales || []).find((r) => r.SaleId === String(id));
    if (!sale) return notFound();
    if (sale.Status !== "Unpaid") return Promise.reject(new ApiError(409, "This sale is already paid."));
    const fields = { CashReceived: "", Change: "", ...data, Status: "Paid", PaidAt: new Date().toISOString(), PaidBy: "Demo" };
    Object.assign(sale, fields);
    save();
    return later({ ok: true, fields });
  },
  editUnpaidSale(id, data) {
    const sale = (load().eventSales || []).find((r) => r.SaleId === String(id));
    if (!sale) return notFound();
    if (sale.Status !== "Unpaid") return Promise.reject(new ApiError(409, "This sale is already paid."));
    const fields = { Name: data.Name, Items: data.Items, Note: data.Note, Amount: data.Total, Fee: "0.00", Total: data.Total };
    Object.assign(sale, fields);
    save();
    return later({ ok: true, fields });
  },
  // Demo employees live only in the demo data; demo PINs aren't kept at all.
  employees: () => later(load().employees || [{ Phone: "5550100123", Name: "Sample Employee", Active: "Yes", Access: ["event"], AddedBy: "Demo", AddedAt: "2026-11-01T15:00:00.000Z" }]),
  addEmployee(phone, name) {
    const db = load();
    const list = db.employees || (db.employees = [{ Phone: "5550100123", Name: "Sample Employee", Active: "Yes", Access: ["event"], AddedBy: "Demo", AddedAt: "2026-11-01T15:00:00.000Z" }]);
    const key = String(phone).replace(/\D/g, "").slice(-10);
    if (list.some((e) => e.Phone === key)) return Promise.reject(new ApiError(409, "An employee with that phone number already exists. Reset their PIN instead."));
    list.push({ Phone: key, Name: name, Active: "Yes", Access: ["event"], AddedBy: "Demo", AddedAt: new Date().toISOString() });
    save();
    return later({ ok: true });
  },
  setEmployeePin: () => later({ ok: true }),
  setEmployeeAccess(phone, access) {
    const e = (load().employees || []).find((x) => x.Phone === phone);
    if (e) e.Access = [...access];
    save();
    return later({ ok: true });
  },
  setEmployeeActive(phone, active) {
    const e = (load().employees || []).find((x) => x.Phone === phone);
    if (e) e.Active = active ? "Yes" : "No";
    save();
    return later({ ok: true });
  },
  deleteEmployee(phone) {
    const db = load();
    db.employees = (db.employees || []).filter((x) => x.Phone !== phone);
    save();
    return later({ ok: true });
  },
  cardPayments: () => later(load().cardPayments.slice().reverse()),
  cardPaymentsFor: (invoiceId) => later(load().cardPayments.filter((p) => p.InvoiceId === String(invoiceId))),
  recordCardPayment(data) {
    const db = load();
    db.cardPayments.push({ ...data });
    save();
    return later({ created: 1 });
  },
  // Demo data saved before Event Sales existed has no eventSales list.
  eventSales: () => later((load().eventSales || []).slice().reverse()),
  recordEventSale(data) {
    const db = load();
    db.eventSales = [...(db.eventSales || []), { ...data }];
    save();
    return later({ created: 1 });
  },
};

// Reloading mid-demo keeps the demo's title.
if (typeof document !== "undefined" && isDemo()) document.title = DEMO_BRAND.pageTitle;
