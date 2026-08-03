import { Bot } from "lucide-react";
import "./admin-auggie.css";

export function AdminAuggieLauncher() {
  return (
    <div
      className="admin-auggie-launcher admin-auggie-launcher--placeholder"
      aria-label="Admin Auggie AI assistant placeholder"
    >
      <Bot size={21} aria-hidden="true" />
      <span>Admin Auggie</span>
    </div>
  );
}
