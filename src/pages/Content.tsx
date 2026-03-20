import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, PlusCircle, Lightbulb, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import ContentCalendar from "@/components/content/ContentCalendar";
import ContentCreate from "@/components/content/ContentCreate";
import ContentIdeas from "@/components/content/ContentIdeas";
import ContentAnalytics from "@/components/content/ContentAnalytics";
import { ContentIdea } from "@/types/content";

const TABS = [
  { id: "calendar", label: "Calendar", Icon: Calendar },
  { id: "create", label: "Create", Icon: PlusCircle },
  { id: "ideas", label: "Ideas", Icon: Lightbulb },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Content() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam || "calendar");
  const [selectedIdea, setSelectedIdea] = useState<Partial<ContentIdea> | null>(null);

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (id: TabId) => {
    setActiveTab(id);
    setSearchParams({ tab: id });
    if (id !== "create") setSelectedIdea(null);
  };

  const handleUseIdea = (idea: Partial<ContentIdea>) => {
    setSelectedIdea(idea);
    handleTabChange("create");
  };

  const handleNewPost = (date?: string) => {
    setSelectedIdea(date ? { scheduled_for: date } : null);
    handleTabChange("create");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-xl bg-panel p-1 border border-border">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
                activeTab === id
                  ? "bg-purple text-white shadow-lg shadow-purple/20"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === "calendar" && <ContentCalendar onNewPost={handleNewPost} />}
        {activeTab === "create" && <ContentCreate initialData={selectedIdea} />}
        {activeTab === "ideas" && <ContentIdeas onUseIdea={handleUseIdea} />}
        {activeTab === "analytics" && <ContentAnalytics />}
      </div>
    </div>
  );
}

