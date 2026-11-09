// Finding orders in the sheet's rows. Order Ids are assigned by the sheet
// (plain numbers counting up), so the highest Id is the newest order. The
// rows' order isn't relied on: the sheet lists oldest first, the demo
// newest first.

const idNumber = (row) => {
  const n = Number(String(row?.Id ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : -1;
};

function newest(rows) {
  let best = null;
  for (const row of rows || []) if (idNumber(row) > idNumber(best)) best = row;
  return best && idNumber(best) > 0 ? best : null;
}

// The most recently saved order.
export function newestOrder(rows) {
  return newest(rows);
}

// Every saved order (with a sheet Id), newest first.
export function ordersNewestFirst(rows) {
  return (rows || []).filter((r) => idNumber(r) > 0).sort((a, b) => idNumber(b) - idNumber(a));
}

// The order just submitted from the form: same date, time, name and phone
// (the newest one, in case of a double submit). If the sheet reformatted
// the date or time, the newest order with that name and phone.
export function findSubmittedOrder(rows, data) {
  const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();
  const customer = (rows || []).filter((r) => same(r.Name, data.Name) && same(r.Contact, data.Contact));
  return newest(customer.filter((r) => same(r.Date, data.Date) && same(r.Time, data.Time))) || newest(customer);
}

// "11/09/2026" + "3:12 PM" → a sortable number, or -1 if unreadable.
export function paymentTime(row) {
  const d = String(row?.Date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!d) return -1;
  const t = String(row?.Time || "").match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  let minutes = 0;
  if (t) {
    const ampm = (t[4] || "").toUpperCase();
    const h = ampm ? (Number(t[1]) % 12) + (ampm === "PM" ? 12 : 0) : Number(t[1]);
    minutes = h * 60 + Number(t[2]);
  }
  return Date.UTC(Number(d[3]), Number(d[1]) - 1, Number(d[2])) / 60000 + minutes;
}

// Card payments, newest first. The sheet adds rows at the bottom, so for
// payments in the same minute (or with an unreadable date) the later row
// wins.
export function cardPaymentsNewestFirst(rows) {
  return (rows || [])
    .map((row, i) => ({ row, i, t: paymentTime(row) }))
    .sort((a, b) => b.t - a.t || b.i - a.i)
    .map((x) => x.row);
}
