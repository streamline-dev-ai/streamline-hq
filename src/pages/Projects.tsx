import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCcw, Plus, FolderKanban } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import {
  Button,
  Card,
  CardBody,
  Badge,
  EmptyState,
  PageHeader,
  PageTransition,
  Segmented,
  Skeleton,
} from "@/ui";
import { zar0, type Client } from "@/lib/finance";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_META,
  type Project,
  type ProjectStatus,
} from "@/lib/projects";
import ProjectForm from "@/components/projects/ProjectForm";

type View = "board" | "list";

export default function Projects() {
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("board");
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ProjectStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, cl] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("*").order("business_name"),
      ]);
      if (pr.error) throw pr.error;
      setProjects((pr.data ?? []) as Project[]);
      setClients((cl.data ?? []) as Client[]);
    } catch (e) {
      pushToast({ type: "error", title: "Projects", message: e instanceof Error ? e.message : "Failed to load" });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const clientName = useCallback(
    (id: string) => clients.find((c) => c.id === id)?.business_name ?? "—",
    [clients],
  );

  async function moveProject(id: string, status: ProjectStatus) {
    const prev = projects;
    setProjects((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    const r = await supabase.from("projects").update({ status }).eq("id", id);
    if (r.error) {
      setProjects(prev);
      pushToast({ type: "error", title: "Projects", message: r.error.message });
    }
  }

  const byStatus = useMemo(() => {
    const map: Record<ProjectStatus, Project[]> = {
      planning: [], active: [], on_hold: [], completed: [], cancelled: [],
    };
    for (const p of projects) map[p.status]?.push(p);
    return map;
  }, [projects]);

  return (
    <PageTransition>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} total`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> New
            </Button>
          </div>
        }
      />

      <Segmented
        className="mb-4"
        value={view}
        onChange={(v) => setView(v as View)}
        options={[
          { value: "board", label: "Board" },
          { value: "list", label: "List", count: projects.length },
        ]}
      />

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-7 w-7" />}
          title="No projects yet"
          body="Create a project here, or from a client's detail page."
          action={
            <Button size="md" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          }
        />
      ) : view === "board" ? (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scroll-touch md:-mx-6 md:px-6">
          {PROJECT_STATUSES.map((status) => {
            const meta = PROJECT_STATUS_META[status];
            const list = byStatus[status];
            return (
              <div
                key={status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(status);
                }}
                onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
                onDrop={() => {
                  if (dragId) void moveProject(dragId, status);
                  setDragId(null);
                  setDragOver(null);
                }}
                className={`w-72 shrink-0 rounded-2xl border p-2 transition ${
                  dragOver === status ? "border-brand/50 bg-brand-soft/40" : "border-line bg-panel/40"
                }`}
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <span className="text-xs tabular-nums text-ink-faint">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOver(null);
                      }}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="cursor-pointer rounded-xl border border-line bg-surface p-3 active:scale-[0.99]"
                    >
                      <div className="truncate text-sm font-semibold text-ink">{p.name}</div>
                      <div className="mt-0.5 truncate text-xs text-ink-faint">{clientName(p.client_id)}</div>
                      <div className="mt-2 flex items-center justify-between text-xs text-ink-faint">
                        <span>{p.due_date ? `Due ${p.due_date}` : "No due date"}</span>
                        {p.budget ? <span className="font-mono tabular-nums">{zar0(p.budget)}</span> : null}
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && (
                    <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-ink-faint">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const meta = PROJECT_STATUS_META[p.status];
            return (
              <Card key={p.id} className="cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-ink">{p.name}</div>
                      <div className="mt-0.5 truncate text-sm text-ink-faint">{clientName(p.client_id)}</div>
                    </div>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-faint">
                    <span>{p.due_date ? `Due ${p.due_date}` : "No due date"}</span>
                    {p.budget ? <span className="font-mono tabular-nums text-ink-muted">{zar0(p.budget)}</span> : null}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        clients={clients}
        onSaved={(p) => navigate(`/projects/${p.id}`)}
      />
    </PageTransition>
  );
}
