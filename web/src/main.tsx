import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../style.css";
import { App } from "./app";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The frontend root element is missing.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
