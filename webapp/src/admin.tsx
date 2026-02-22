import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import AdminStandalone from "./admin/AdminStandalone";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminStandalone />
  </React.StrictMode>
);
