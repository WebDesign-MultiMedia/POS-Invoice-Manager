import { useEffect, useMemo, useState } from "react";
import { fetchAllOrders } from "../api/sheetdb.js";
import { formatLongDate, formatMoney } from "../lib/format.js";
import { TYPE_GROUPS, orderYears, typeTotals } from "../lib/orderTotals.js";
import { friendlyMessage } from "../lib/errors.js";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "2026-11-20" → "November 20, 2026"
const longDue = (due) => {
  const [y, m, d] = due.split("-");
  return formatLongDate(`${m}/${d}/${y}`);
};

// The Search page's Catering / Delivery / Pick-ups cards: what each kind of
// order brought in, for every year together or one year. "Show orders"
// lists that kind's orders under the cards.
//   <OrderTypeTotals onShowOrders={(title, orders) => …} />
export default function OrderTypeTotals({ onShowOrders }) {
  const [state, setState] = useState({ orders: [], loading: true, error: "" });
  const [year, setYear] = useState(null); // null = all years
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchAllOrders()
      .then((orders) => live && setState({ orders, loading: false, error: "" }))
      .catch((err) => {
        console.error("Couldn't load order totals:", err);
        if (live) setState({ orders: [], loading: false, error: friendlyMessage(err, "Couldn't load the totals.") });
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const years = useMemo(() => orderYears(state.orders), [state.orders]);
  const totals = useMemo(() => typeTotals(state.orders, { year, today: todayInput() }), [state.orders, year]);
  const grandTotal = TYPE_GROUPS.reduce((sum, g) => sum + totals[g.key].total, 0);
  const owedTotal = TYPE_GROUPS.reduce((sum, g) => sum + totals[g.key].pendingOwed, 0);

  return (
    <section className="w-full max-w-4xl mt-8 stagger-in" aria-labelledby="typeTotalsTitle">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div className="text-center sm:text-left">
          <h2 id="typeTotalsTitle" className="text-xl font-semibold text-brand-navy">
            <i className="fa-solid fa-chart-column text-brand-gold" aria-hidden="true"></i> Totals by order type
          </h2>
          {!state.loading && !state.error && (
            <p className="text-sm text-brand-navydeep/80">
              {formatMoney(grandTotal)} {year ? `in ${year}` : "across all years"}
              {owedTotal > 0 ? ` · ${formatMoney(owedTotal)} not paid yet` : ""}
            </p>
          )}
        </div>
        {years.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Which years to total">
            {[null, ...years].map((y) => (
              <button
                key={y ?? "all"}
                type="button"
                aria-pressed={year === y}
                onClick={() => setYear(y)}
                className={`rounded-full px-3 py-1 text-sm font-semibold border ${year === y ? "bg-brand-navy text-white border-brand-navy" : "border-brand-navy/40 text-brand-navy"}`}
              >
                {y ?? "All years"}
              </button>
            ))}
          </div>
        )}
      </div>

      {state.loading && (
        <p className="text-center text-brand-muted/90 py-6">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Adding up orders…
        </p>
      )}

      {state.error && (
        <div role="alert" className="glass-card p-5 text-center text-sm">
          <p className="mb-3">{state.error}</p>
          <button type="button" className="btn-3d !py-2 text-sm" onClick={() => setAttempt((n) => n + 1)}>
            <i className="fa-solid fa-rotate-right" aria-hidden="true"></i> Try again
          </button>
        </div>
      )}

      {!state.loading && !state.error && (
        <div className="grid gap-4 sm:grid-cols-3">
          {TYPE_GROUPS.map((g) => {
            const t = totals[g.key];
            const next = t.upcoming[0];
            return (
              <div key={g.key} className="glass-card p-5 flex flex-col">
                <p className="field-label !mb-1">
                  <i className={`fa-solid ${g.icon}`} aria-hidden="true"></i> {g.label}
                </p>
                <p className="text-3xl font-bold text-brand-navy">{formatMoney(t.total)}</p>
                <p className="text-sm text-brand-navydeep/80 mb-3">
                  {t.count} order{t.count === 1 ? "" : "s"}
                  {t.count ? ` · avg ${formatMoney(t.average)}` : ""}
                </p>
                <ul className="space-y-1.5 text-sm text-brand-navydeep flex-1">
                  {g.key === "catering" && t.setupCount > 0 && (
                    <li>
                      <i className="fa-solid fa-fire-burner w-5 text-brand-terracotta" aria-hidden="true"></i> {t.setupCount} with setup, {t.count - t.setupCount} drop-off or other
                    </li>
                  )}
                  {t.pendingCount > 0 && (
                    <li>
                      <i className="fa-solid fa-hourglass-half w-5 text-brand-coral" aria-hidden="true"></i> {formatMoney(t.pendingOwed)} not paid yet ({t.pendingCount})
                    </li>
                  )}
                  {next && (
                    <li>
                      <i className="fa-solid fa-calendar-check w-5 text-brand-teal" aria-hidden="true"></i> {t.upcoming.length} coming up · next {longDue(next.due)}
                      {next.order.DueTime ? ` at ${next.order.DueTime}` : ""}
                      {next.order.Name ? ` for ${next.order.Name}` : ""}
                    </li>
                  )}
                  {t.topCustomer && (
                    <li>
                      <i className="fa-solid fa-star w-5 text-brand-gold" aria-hidden="true"></i> Top customer: {t.topCustomer.name} ({t.topCustomer.count} orders)
                    </li>
                  )}
                </ul>
                <div className="grid gap-2 mt-4">
                  <button type="button" className="btn-3d !py-2 text-sm justify-center disabled:opacity-60" disabled={!t.count} onClick={() => onShowOrders(`${g.label}${year ? ` · ${year}` : ""}`, t.orders)}>
                    <i className="fa-solid fa-list" aria-hidden="true"></i> Show orders
                  </button>
                  {t.upcoming.length > 0 && (
                    <button
                      type="button"
                      className="btn-3d !py-2 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy"
                      onClick={() => onShowOrders(`${g.label} coming up`, t.upcoming.map((u) => u.order), { soonestFirst: true })}
                    >
                      <i className="fa-solid fa-calendar-check" aria-hidden="true"></i> Coming up ({t.upcoming.length})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
