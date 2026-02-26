import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import OwnerPortal from "./admin/OwnerPortal";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OwnerPortal />
  </React.StrictMode>
);
