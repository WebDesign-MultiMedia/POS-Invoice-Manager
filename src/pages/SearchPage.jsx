import { useState } from "react";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";
import Layout, { PageHeader } from "../components/Layout.jsx";
import TiltCard from "../components/TiltCard.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import { fetchAllOrders } from "../api/sheetdb.js";
import { formatDate, parseStoredDate, escapeRegex } from "../lib/format.js";

const SEARCH_FIELDS = {
  Contact: { label: "Phone number", icon: "fa-phone", type: "text", placeholder: "e.g. 555-0100" },
  Name: { label: "Customer name", icon: "fa-user", type: "text", placeholder: "e.g. Jane Doe" },
  Address: { label: "Address", icon: "fa-location-dot", type: "text", placeholder: "e.g. 123 Main St" },
  Date: { label: "Order date", icon: "fa-calendar-days", type: "date", placeholder: "" },
  Month: { label: "Order month", icon: "fa-calendar", type: "month", placeholder: "" },
  Year: { label: "Order year", icon: "fa-calendar-week", type: "number", placeholder: "e.g. 2026" },
};

function filterOrders(data, field, query) {
  if (field === "Date") {
    return data.filter((row) => row.Date === query);
  }
  if (field === "Month") {
    const [qYear, qMonth] = query.split("-").map(Number);
    return data.filter((row) => {
      const parsed = parseStoredDate(row.Date);
      return parsed && parsed.month === qMonth && parsed.year === qYear;
    });
  }
  if (field === "Year") {
    const qYear = Number(query);
    return data.filter((row) => {
      const parsed = parseStoredDate(row.Date);
      return parsed && parsed.year === qYear;
    });
  }
  const regex = new RegExp(escapeRegex(query), "i");
  return data.filter((row) => regex.test(row[field] || ""));
}

export default function SearchPage() {
  const [field, setFieldName] = useState("Contact");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [results, setResults] = useState(null);

  const config = SEARCH_FIELDS[field];

  const handleFieldChange = (e) => {
    setFieldName(e.target.value);
    setQuery("");
  };

  const runSearch = async () => {
    const rawQuery = query.trim();
    if (!rawQuery) {
      Swal.fire({ title: `Enter a ${config.label.toLowerCase()}`, icon: "warning", theme: "dark", timer: 1400, showConfirmButton: false });
      return;
    }

    const effectiveQuery = field === "Date" ? formatDate(rawQuery) : rawQuery;

    setStatus("loading");
    try {
      const data = await fetchAllOrders();
      setResults(filterOrders(data, field, effectiveQuery));
      setStatus("idle");
    } catch (err) {
      console.error("Error fetching data:", err);
      setStatus("error");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") runSearch();
  };

  return (
    <Layout blobs={["bg-brand-teal w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-terracotta w-64 h-64 top-1/2 -left-16 animate-float"]}>
      <PageHeader title="Search Orders" subtitle="By phone, name, address, date, month, or year" />

      <NavRow className="mb-8">
        <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
        <NavFab to="/invoice" title="View invoice" icon="fa-file-invoice-dollar" colorClass="text-brand-terracotta" glowClass="shadow-glow-terracotta" />
        <NavFab to="/updates" title="What's new" icon="fa-wand-magic-sparkles" colorClass="text-brand-pink" glowClass="shadow-glow-pink" />
        <NavFab to="/pay" title="Pay with Card" icon="fa-credit-card" colorClass="text-brand-cactus" glowClass="shadow-glow-teal" />
      </NavRow>

      <TiltCard maxDeg={3} wrapClassName="w-full max-w-lg stagger-in" className="glass-card p-5 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="field-group w-full sm:w-36">
          <label htmlFor="searchField" className="field-label">
            <i className="fa-solid fa-filter"></i> Search by
          </label>
          <select id="searchField" className="input-3d text-center" value={field} onChange={handleFieldChange}>
            <option value="Contact">Phone</option>
            <option value="Name">Name</option>
            <option value="Address">Address</option>
            <option value="Date">Date</option>
            <option value="Month">Month</option>
            <option value="Year">Year</option>
          </select>
        </div>
        <div className="flex-1 field-group">
          <label htmlFor="searchQuery" className="field-label">
            <i className={`fa-solid ${config.icon}`}></i> {config.label}
          </label>
          <input
            type={config.type}
            id="searchQuery"
            placeholder={config.placeholder}
            className="input-3d text-center"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button id="searchBtn" className="btn-3d" onClick={runSearch}>
          <i className="fa-solid fa-magnifying-glass"></i> Search
        </button>
      </TiltCard>

      <div id="searchResults" className="w-full max-w-4xl mt-8 grid gap-4 sm:grid-cols-2">
        {status === "loading" && (
          <div className="col-span-full flex flex-col items-center gap-3 py-10 text-brand-muted/80">
            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-brand-gold"></i>
            <p>Searching orders...</p>
          </div>
        )}

        {status === "error" && (
          <div className="col-span-full flex flex-col items-center gap-2 py-10 text-brand-coral">
            <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
            <p>Something went wrong fetching orders. Try again.</p>
          </div>
        )}

        {status === "idle" && results !== null && results.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-2 py-10 text-brand-muted/80 stagger-in">
            <i className="fa-solid fa-folder-open text-3xl text-brand-muted/50"></i>
            <p>No matching orders found</p>
          </div>
        )}

        {status === "idle" &&
          results !== null &&
          results.map((order, i) => (
            <TiltCard key={order.Id ?? i} maxDeg={4} className="glass-card p-5 stagger-in" delayMs={i * 70}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-brand-navy font-semibold">
                  <i className="fa-solid fa-hashtag"></i> {order.Id ?? ""}
                </span>
                <span className="text-sm text-brand-muted/70">
                  <i className="fa-solid fa-calendar-days"></i> {order.Date ?? ""}
                </span>
              </div>
              <div className="space-y-1.5 text-sm text-brand-navydeep">
                <p>
                  <i className="fa-solid fa-user text-brand-gold w-5"></i> {order.Name ?? ""}
                </p>
                <p>
                  <i className="fa-solid fa-phone text-brand-teal w-5"></i> {order.Contact ?? ""}
                </p>
                <p>
                  <i className="fa-solid fa-location-dot text-brand-coral w-5"></i> {order.Address ?? ""}
                </p>
                <p>
                  <i className="fa-solid fa-clipboard-list text-brand-terracotta w-5"></i> {order.Items ?? ""}
                </p>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-brand-navydeep/10">
                <span className="text-xs uppercase tracking-wide text-brand-muted/70">
                  <i className="fa-solid fa-wallet"></i> {order.Payment ?? ""}
                </span>
                <span className="text-lg font-bold text-brand-navy">${order.Cost ?? "0"}</span>
              </div>
              <Link
                to={`/invoice?id=${encodeURIComponent(order.Id ?? "")}`}
                target="_blank"
                rel="noopener"
                className="btn-3d w-full justify-center mt-4 !py-2 text-sm"
              >
                <i className="fa-solid fa-file-invoice-dollar"></i> Generate Invoice
              </Link>
            </TiltCard>
          ))}
      </div>
    </Layout>
  );
}
