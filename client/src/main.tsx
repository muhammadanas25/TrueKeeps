/**
 * Client entry. Public pages arrive with real HTML already in #root
 * (scripts/prerender.mjs), so hydrate attaches React to it without repainting;
 * app routes arrive empty and render from scratch.
 */

import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, <App />);
else createRoot(root).render(<App />);
