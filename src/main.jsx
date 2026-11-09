import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "sweetalert2/dist/sweetalert2.min.css";
import "./index.css";
import App from "./App.jsx";
import { initTheme } from "./lib/theme.js";
import { startAutoUpdate } from "./lib/autoUpdate.js";

initTheme();
startAutoUpdate();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
