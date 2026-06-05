// Projects module domain types + status metadata.
// Mirrors the live schema (projects / milestones / project_tasks / deliverables).
// project_tasks is intentionally its OWN table — never the Baseline-shared `tasks`.

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
export type MilestoneStatus = "pending" | "in_progress" | "done";
export type ProjectTaskStatus = "todo" | "doing" | "done";
export type DeliverableStatus = "pending" | "delivered" | "approved";

export type Project = {
  id: string;
  client_id: string;
  lead_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  budget: number | null;
  created_at: string | null;
};

export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: MilestoneStatus;
  amount: number | null;
  invoiced: boolean;
  sort_order: number;
  created_at?: string | null;
};

export type ProjectTask = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  status: ProjectTaskStatus;
  due_date: string | null;
  sort_order: number;
  created_at?: string | null;
};

export type Deliverable = {
  id: string;
  project_id: string;
  title: string;
  file_url: string | null;
  status: DeliverableStatus;
  delivered_at: string | null;
  notes: string | null;
  created_at?: string | null;
};

type Tone = "neutral" | "brand" | "accent" | "success" | "danger" | "warn";

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planning: { label: "Planning", tone: "neutral" },
  active: { label: "Active", tone: "brand" },
  on_hold: { label: "On hold", tone: "warn" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

// Column order for the kanban board.
export const PROJECT_STATUSES: ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];

export const MILESTONE_STATUS_META: Record<MilestoneStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "neutral" },
  in_progress: { label: "In progress", tone: "warn" },
  done: { label: "Done", tone: "success" },
};

export const TASK_STATUS_META: Record<ProjectTaskStatus, { label: string; tone: Tone }> = {
  todo: { label: "To do", tone: "neutral" },
  doing: { label: "Doing", tone: "warn" },
  done: { label: "Done", tone: "success" },
};

export const DELIVERABLE_STATUS_META: Record<DeliverableStatus, { label: string; tone: Tone }> = {
  pending: { label: "Pending", tone: "neutral" },
  delivered: { label: "Delivered", tone: "brand" },
  approved: { label: "Approved", tone: "success" },
};
