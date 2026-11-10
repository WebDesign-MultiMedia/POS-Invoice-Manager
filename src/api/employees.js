// Staff: employee logins (phone + 4-digit PIN, Event Sales only), saved in
// the sheet's "Employees" tab by api/employees.js. PINs go to the server
// once and are stored only as hashes; they can't be read back.
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { isDemo, demoApi } from "../lib/demo.js";
import { apiErrorFrom } from "../lib/errors.js";

const API = "/api/employees";

async function call(init, query = "") {
  const res = await fetch(`${API}${query}`, init);
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}

const post = (body) => call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function listEmployees() {
  if (isDemo()) return demoApi.employees();
  return call({ method: "GET" }, "?action=list");
}

export const addEmployee = (phone, name, pin) => (isDemo() ? demoApi.addEmployee(phone, name, pin) : post({ action: "add", phone, name, pin }));
export const setEmployeePin = (phone, pin) => (isDemo() ? demoApi.setEmployeePin(phone, pin) : post({ action: "setPin", phone, pin }));
// access: the ticked keys from lib/permissions.js, e.g. ["event", "orders", "manage"].
export const setEmployeeAccess = (phone, access) => (isDemo() ? demoApi.setEmployeeAccess(phone, access) : post({ action: "setAccess", phone, access }));
export const setEmployeeActive = (phone, active) => (isDemo() ? demoApi.setEmployeeActive(phone, active) : post({ action: "setActive", phone, active }));
export const deleteEmployee = (phone) => (isDemo() ? demoApi.deleteEmployee(phone) : post({ action: "delete", phone }));
