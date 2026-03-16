import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Today from "@/pages/Today";
import Leads from "@/pages/Leads";
import Messages from "@/pages/Messages";
import Clients from "@/pages/Clients";
import Finance from "@/pages/Finance";
import Content from "@/pages/Content";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/today" element={<Today />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/content" element={<Content />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </Router>
  );
}
