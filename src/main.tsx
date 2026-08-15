import { createRoot } from "react-dom/client";
import { OceanExperience } from "./OceanExperience";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(<OceanExperience />);
