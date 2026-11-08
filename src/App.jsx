import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation, useSearchParams } from "react-router-dom";
import OrderFormPage from "./pages/OrderFormPage.jsx";
import LoginPage, { AuthSplash } from "./pages/LoginPage.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
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

// Every page is staff-only, except a customer's read-only invoice link
// (/invoice?id=…&token=…&share=1), which the server checks on its own.
function StaffGate({ children }) {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  if (pathname === "/invoice" && searchParams.get("share") === "1") return children;
  if (status === "loading") return <AuthSplash />;
  if (status !== "in" && status !== "demo") return <LoginPage />;
  return children;
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
                <Route path="/broadcast" element={<BroadcastPage />} />
                <Route path="/catering" element={<CateringCalcPage />} />
              </Routes>
            </Suspense>
          </StaffGate>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
