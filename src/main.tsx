import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// بدون StrictMode لتجنب إنشاء محرك Three.js مرتين أثناء التطوير
createRoot(document.getElementById("root")!).render(<App />);
