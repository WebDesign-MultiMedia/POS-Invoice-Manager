import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import { addEmployee, deleteEmployee, listEmployees, setEmployeeActive, setEmployeePin } from "../api/employees.js";
import { friendlyMessage } from "../lib/errors.js";

// Staff: employee logins. An employee logs in with their phone number and a
// 4-digit PIN and can only use Event Sales. Accounts are saved in the
// "Employees" tab of the order sheet; PINs are saved only as hashes, so a
// forgotten PIN is reset, never looked up.

const ALERT = { theme: "dark" };

const digits = (v) => String(v ?? "").replace(/\D/g, "");
export function showPhone(v) {
  const d = digits(v).slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(v ?? "");
}

// Same rules as the server (api/_lib/employees.js), checked here first so
// mistakes show before anything is sent.
export function pinProblem(pin) {
  if (!/^\d{4}$/.test(pin)) return "The PIN must be exactly 4 digits.";
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin) || /^(19|20)\d\d$/.test(pin)) {
    return "That PIN is too easy to guess (all one digit, in a row, or a year). Pick another.";
  }
  return null;
}

async function askNewPin(name) {
  const { value: pin } = await Swal.fire({
    ...ALERT,
    title: `New PIN for ${name}`,
    input: "password",
    inputLabel: "4 digits. Tell the employee their new PIN.",
    inputAttributes: { inputmode: "numeric", maxlength: "4", autocomplete: "new-password" },
    showCancelButton: true,
    confirmButtonText: "Save PIN",
    inputValidator: (v) => pinProblem(String(v || "").trim()),
  });
  return pin ? String(pin).trim() : null;
}

export default function EmployeesPage() {
  const [state, setState] = useState({ rows: [], loading: true, error: "" });
  const [form, setForm] = useState({ name: "", phone: "", pin: "" });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");

  const load = () =>
    listEmployees()
      .then((rows) => setState({ rows, loading: false, error: "" }))
      .catch((err) => {
        console.error("listEmployees failed:", err);
        setState({ rows: [], loading: false, error: friendlyMessage(err, "Couldn't load employees.") });
      });

  useEffect(() => {
    load();
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: key === "name" ? e.target.value : digits(e.target.value).slice(0, key === "pin" ? 4 : 11) }));

  const add = async (e) => {
    e.preventDefault();
    if (saving) return;
    const problem = !form.name.trim()
      ? "Enter the employee's name."
      : digits(form.phone).length < 10
        ? "Enter a 10-digit phone number."
        : pinProblem(form.pin);
    if (problem) {
      Swal.fire({ ...ALERT, title: "Check the details", text: problem, icon: "error" });
      return;
    }
    setSaving(true);
    try {
      await addEmployee(form.phone, form.name.trim(), form.pin);
      const name = form.name.trim();
      setForm({ name: "", phone: "", pin: "" });
      await load();
      Swal.fire({ ...ALERT, title: `${name} can log in`, text: "They log in with their phone number and PIN, and only see Event Sales.", icon: "success" });
    } catch (err) {
      Swal.fire({ ...ALERT, title: "Employee not added", text: friendlyMessage(err, "Couldn't add the employee."), icon: "error" });
    } finally {
      setSaving(false);
    }
  };

  const run = async (phone, action, done) => {
    setBusy(phone);
    try {
      await action();
      await load();
      if (done) Swal.fire({ ...ALERT, title: done, icon: "success", timer: 1600, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ ...ALERT, title: "Not saved", text: friendlyMessage(err, "Couldn't save the change."), icon: "error" });
    } finally {
      setBusy("");
    }
  };

  const resetPin = async (emp) => {
    const pin = await askNewPin(emp.Name || showPhone(emp.Phone));
    if (pin) run(emp.Phone, () => setEmployeePin(emp.Phone, pin), "PIN changed");
  };

  const remove = async (emp) => {
    const { isConfirmed } = await Swal.fire({
      ...ALERT,
      title: `Delete ${emp.Name || "this employee"}?`,
      text: "They won't be able to log in any more, and are logged out within a minute. Their past sales stay.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash"></i> Delete',
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Keep",
      focusCancel: true,
    });
    if (isConfirmed) run(emp.Phone, () => deleteEmployee(emp.Phone), "Employee deleted");
  };

  return (
    <Layout blobs={["bg-brand-teal w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-gold w-64 h-64 bottom-0 -left-16 animate-float"]}>
      <SiteNav className="mb-6" />
      <PageHeader title="Employees" subtitle="Event Sales logins" />

      <form onSubmit={add} className="glass-card w-full max-w-md p-5 sm:p-6 stagger-in flex flex-col gap-4" aria-labelledby="add-h">
        <h2 id="add-h" className="field-label !mb-0 justify-center">
          <i className="fa-solid fa-user-plus" aria-hidden="true"></i> Add an employee
        </h2>
        <p className="text-sm text-center text-brand-navydeep/80">They log in with their phone number and a 4-digit PIN, and can only use Event Sales.</p>
        <div className="field-group">
          <label htmlFor="emp-name" className="field-label">
            <i className="fa-solid fa-user" aria-hidden="true"></i> Name
          </label>
          <input id="emp-name" className="input-3d" autoComplete="off" value={form.name} onChange={set("name")} placeholder="e.g. Carlos" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="field-group min-w-0">
            <label htmlFor="emp-phone" className="field-label">
              <i className="fa-solid fa-phone" aria-hidden="true"></i> Phone
            </label>
            <input id="emp-phone" className="input-3d" type="tel" inputMode="numeric" autoComplete="off" value={showPhone(form.phone)} onChange={set("phone")} placeholder="(347) 555-0123" />
          </div>
          <div className="field-group min-w-0">
            <label htmlFor="emp-pin" className="field-label">
              <i className="fa-solid fa-lock" aria-hidden="true"></i> 4-digit PIN
            </label>
            <input id="emp-pin" className="input-3d tracking-[0.4em]" type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} value={form.pin} onChange={set("pin")} placeholder="••••" />
          </div>
        </div>
        <button type="submit" className="btn-3d justify-center disabled:opacity-60" disabled={saving} aria-busy={saving}>
          <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-user-plus"}`} aria-hidden="true"></i> {saving ? "Saving…" : "Add employee"}
        </button>
        <p className="text-xs text-center text-brand-navydeep/70">The PIN is saved scrambled in the Employees tab of the sheet. It can&apos;t be looked up later, only reset.</p>
      </form>

      <section className="glass-card w-full max-w-md mt-8 p-5 sm:p-6 stagger-in" aria-label="Employees">
        <h2 className="field-label !mb-3 justify-center">
          <i className="fa-solid fa-users" aria-hidden="true"></i> Employees
        </h2>
        {state.loading ? (
          <p className="text-center text-sm text-brand-navydeep/80">Loading…</p>
        ) : state.error ? (
          <p className="text-center text-sm text-brand-navydeep/80">
            {state.error} If this keeps happening, check that the sheet has a tab named <strong>Employees</strong>.
          </p>
        ) : !state.rows.length ? (
          <p className="text-center text-sm text-brand-navydeep/80">No employees yet. Add one above.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-brand-navydeep/15">
            {state.rows.map((emp) => {
              const active = emp.Active !== "No";
              const working = busy === emp.Phone;
              return (
                <li key={emp.Phone} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-brand-navy truncate">{emp.Name || "No name"}</p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${active ? "border-brand-teal/60 text-brand-teal" : "border-brand-navydeep/30 text-brand-navydeep/70"}`}
                    >
                      {active ? "Can log in" : "Turned off"}
                    </span>
                  </div>
                  <p className="text-sm text-brand-navydeep/80">{showPhone(emp.Phone)}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" disabled={working} onClick={() => resetPin(emp)} className="btn-3d !py-2 !px-2 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60">
                      <i className="fa-solid fa-key" aria-hidden="true"></i> PIN
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => run(emp.Phone, () => setEmployeeActive(emp.Phone, !active), active ? "Turned off" : "Turned on")}
                      className="btn-3d !py-2 !px-2 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60"
                    >
                      <i className={`fa-solid ${active ? "fa-user-slash" : "fa-user-check"}`} aria-hidden="true"></i> {active ? "Turn off" : "Turn on"}
                    </button>
                    <button type="button" disabled={working} onClick={() => remove(emp)} aria-label={`Delete ${emp.Name || "employee"}`} className="btn-3d !py-2 !px-2 text-sm justify-center !bg-none !bg-transparent border border-brand-error/60 text-brand-error disabled:opacity-60">
                      <i className="fa-solid fa-trash" aria-hidden="true"></i> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Layout>
  );
}
