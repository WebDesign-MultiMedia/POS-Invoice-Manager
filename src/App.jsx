import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation, useSearchParams } from "react-router-dom";
import OrderFormPage from "./pages/OrderFormPage.jsx";
import LoginPage, { AuthSplash } from "./pages/LoginPage.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { canOpen, homeFor } from "./lib/permissions.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// The order form (the page staff open most) ships in the main bundle; the
// other pages load on first visit, so Stripe.js and html2canvas aren't
// downloaded until the Pay or Invoice page needs them.
const SearchPage = lazy(() => import("./pages/SearchPage.jsx"));
const InvoicePage = lazy(() => import("./pages/InvoicePage.jsx"));
const UpdatesPage = lazy(() => import("./pages/UpdatesPage.jsx"));
const PayPage = lazy(() => import("./pages/PayPage.jsx"));
const BroadcastPage = lazy(() => import("./pages/BroadcastPage.jsx"));
const CateringCalcPage = lazy(() => import("./pages/CateringCalcPage.jsx"));
const EventSalesPage = lazy(() => import("./pages/EventSalesPage.jsx"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage.jsx"));
const ShoppingPage = lazy(() => import("./pages/ShoppingPage.jsx"));

// Every page is staff-only, except a customer's read-only invoice link
// (/invoice?id=…&token=…&share=1) and the Catering Calculator's employee
// link (/catering?share=1&token=…), which the server checks on their own.
function StaffGate({ children }) {
  const { status, isEmployee, can, logout, name } = useAuth();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  if (pathname === "/invoice" && searchParams.get("share") === "1") return children;
  // The Catering Calculator's employee link: the page checks its signed
  // token with the server and shows only the calculator (no login).
  if (pathname === "/catering" && searchParams.get("share") === "1") return children;
  if (status === "loading") return <AuthSplash />;
  if (status !== "in" && status !== "demo") return <LoginPage />;
  // Employees only open the sections the owner gave them (Team page); any
  // other page sends them to their first one. The server checks too.
  if (isEmployee && !canOpen(can, pathname)) {
    const home = homeFor(can);
    if (home) return <Navigate to={home} replace />;
    return <NoAccess name={name} onLogout={logout} />;
  }
  return children;
}

// An employee with every section turned off.
function NoAccess({ name, onLogout }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card max-w-sm w-full p-6 text-center flex flex-col gap-4">
        <i className="fa-solid fa-lock text-3xl text-brand-gold" aria-hidden="true"></i>
        <h1 className="text-xl font-semibold text-brand-navy">No sections yet{name ? `, ${name}` : ""}</h1>
        <p className="text-sm text-brand-navydeep/80">Your login works, but no sections are turned on for you. Ask the owner to give you access on the Team page.</p>
        <button type="button" className="btn-3d justify-center" onClick={onLogout}>
          <i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Log out
        </button>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <StaffGate>
            <Suspense fallback={<AuthSplash />}>
              <Routes>
                <Route path="/" element={<OrderFormPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/invoice" element={<InvoicePage />} />
                <Route path="/updates" element={<UpdatesPage />} />
                <Route path="/pay" element={<PayPage />} />
                <Route path="/event" element={<EventSalesPage />} />
                <Route path="/employees" element={<EmployeesPage />} />
                <Route path="/broadcast" element={<BroadcastPage />} />
                <Route path="/catering" element={<CateringCalcPage />} />
                <Route path="/shopping" element={<ShoppingPage />} />
              </Routes>
            </Suspense>
          </StaffGate>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
