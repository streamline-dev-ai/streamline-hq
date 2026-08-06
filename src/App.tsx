import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Today from "@/pages/Today";
import Leads from "@/pages/Leads";
import Messages from "@/pages/Messages";
import Clients from "@/pages/Clients";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Finance from "@/pages/Finance";
import Content from "@/pages/Content";
import LeadEngine from "@/pages/LeadEngineV2";
import LeadEngineLegacy from "@/pages/LeadEngine";
import EmailPilot from "@/pages/EmailPilot";
import Settings from "@/pages/Settings";
import InvoicePrint from "@/pages/InvoicePrint";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        {/* Print routes live OUTSIDE the app shell (no nav chrome) */}
        <Route path="/invoice/:id/print" element={<InvoicePrint />} />
        <Route element={<AppLayout />}>
          <Route path="/today" element={<Today />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/content" element={<Content />} />
          <Route path="/lead-engine" element={<LeadEngine />} />
          <Route path="/lead-engine/legacy" element={<LeadEngineLegacy />} />
          <Route path="/email-pilot" element={<EmailPilot />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </Router>
  );
}
