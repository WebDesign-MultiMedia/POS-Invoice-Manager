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
