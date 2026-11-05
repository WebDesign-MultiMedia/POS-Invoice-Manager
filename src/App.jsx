import { BrowserRouter, Routes, Route, useLocation, useSearchParams } from "react-router-dom";
import OrderFormPage from "./pages/OrderFormPage.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import InvoicePage from "./pages/InvoicePage.jsx";
import UpdatesPage from "./pages/UpdatesPage.jsx";
import PayPage from "./pages/PayPage.jsx";
import BroadcastPage from "./pages/BroadcastPage.jsx";
import LoginPage, { AuthSplash } from "./pages/LoginPage.jsx";
import { AuthProvider, useAuth } from "./lib/auth.jsx";

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
    <BrowserRouter>
      <AuthProvider>
        <StaffGate>
          <Routes>
            <Route path="/" element={<OrderFormPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/invoice" element={<InvoicePage />} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="/pay" element={<PayPage />} />
            <Route path="/broadcast" element={<BroadcastPage />} />
          </Routes>
        </StaffGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
