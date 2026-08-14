import { BrowserRouter, Routes, Route } from "react-router-dom";
import OrderFormPage from "./pages/OrderFormPage.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import InvoicePage from "./pages/InvoicePage.jsx";
import UpdatesPage from "./pages/UpdatesPage.jsx";
import PayPage from "./pages/PayPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OrderFormPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/invoice" element={<InvoicePage />} />
        <Route path="/updates" element={<UpdatesPage />} />
        <Route path="/pay" element={<PayPage />} />
      </Routes>
    </BrowserRouter>
  );
}
