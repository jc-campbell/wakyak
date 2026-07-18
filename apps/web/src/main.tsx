import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { WakYakApp } from "@/showcase";

import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WakYakApp />
  </StrictMode>,
);
