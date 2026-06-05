import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import { getSaDateString } from "@/utils/saDate";
import { Button, Sheet, Field, Input, Select, Textarea } from "@/ui";
import type { Client } from "@/lib/finance";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_META,
  type Project,
  type ProjectStatus,
} from "@/lib/projects";

/**
 * Create / edit a project. Clients are the source of truth; a project always
 * belongs to a client and optionally inherits that client's linked lead.
 */
export default function ProjectForm({
  open,
  onClose,
  clients,
  defaultClientId,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  defaultClientId?: string | null;
  editing?: Project | null;
  onSaved: (project: Project) => void;
}) {
  const { pushToast } = useToast();
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [startDate, setStartDate] = useState(getSaDateString());
  const [dueDate, setDueDate] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClientId(editing.client_id);
      setName(editing.name);
      setDescription(editing.description ?? "");
      setStatus(editing.status);
      setStartDate(editing.start_date ?? getSaDateString());
      setDueDate(editing.due_date ?? "");
      setBudget(editing.budget != null ? String(editing.budget) : "");
    } else {
      setClientId(defaultClientId ?? "");
      setName("");
      setDescription("");
      setStatus("planning");
      setStartDate(getSaDateString());
      setDueDate("");
      setBudget("");
    }
  }, [open, editing, defaultClientId]);

  async function save() {
    if (!clientId) return pushToast({ type: "error", title: "Project", message: "Pick a client" });
    if (!name.trim()) return pushToast({ type: "error", title: "Project", message: "Name required" });
    setSaving(true);
    try {
      const head = {
        client_id: clientId,
        name: name.trim(),
        description: description.trim() || null,
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
        budget: budget.trim() ? Number(budget) : null,
      };
      let saved: Project;
      if (editing) {
        const up = await supabase.from("projects").update(head).eq("id", editing.id).select("*").single();
        if (up.error) throw up.error;
        saved = up.data as Project;
      } else {
        // Inherit the client's linked lead so lead ↔ project stays navigable.
        const lead = clients.find((c) => c.id === clientId)?.lead_id ?? null;
        const ins = await supabase
          .from("projects")
          .insert({ ...head, lead_id: lead })
          .select("*")
          .single();
        if (ins.error) throw ins.error;
        saved = ins.data as Project;
      }
      pushToast({ type: "success", title: editing ? "Saved" : "Project created", message: saved.name });
      onSaved(saved);
      onClose();
    } catch (e) {
      pushToast({ type: "error", title: "Project", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit project" : "New project"}>
      <div className="space-y-4">
        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!!editing}>
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Project name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website + booking system" />
        </Field>

        <Field label="Description (optional)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Budget (R, optional)">
            <Input type="number" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink outline-none focus:border-brand"
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink outline-none focus:border-brand"
            />
          </Field>
        </div>

        <Button block size="lg" loading={saving} onClick={() => void save()}>
          {editing ? "Save project" : "Create project"}
        </Button>
      </div>
    </Sheet>
  );
}
