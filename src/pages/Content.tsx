import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import ContentCalendar from "@/components/content/ContentCalendar";
import ContentCreate from "@/components/content/ContentCreate";
import ContentIdeas from "@/components/content/ContentIdeas";
import ContentAnalytics from "@/components/content/ContentAnalytics";
import { ContentIdea, ContentPost } from "@/types/content";
import { PageHeader, PageTransition, Segmented } from "@/ui";

const TABS = [
  { value: "calendar", label: "Calendar" },
  { value: "create", label: "Create" },
  { value: "ideas", label: "Ideas" },
  { value: "analytics", label: "Analytics" },
] as const;

type TabId = (typeof TABS)[number]["value"];

export default function Content() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam || "calendar");
  const [selectedIdea, setSelectedIdea] = useState<Partial<ContentIdea> | null>(null);
  const [editingPost, setEditingPost] = useState<ContentPost | null>(null);

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) setActiveTab(tabParam);
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setEditingPost(null);
    handleTabChange("create");
  };
  const handleEditPost = (post: ContentPost) => {
    setEditingPost(post);
    setSelectedIdea(null);
    handleTabChange("create");
  };

  return (
    <PageTransition>
      <PageHeader title="Content" subtitle="Plan, create & track posts" />
      <Segmented
        value={activeTab}
        onChange={(v) => handleTabChange(v as TabId)}
        options={TABS.map((t) => ({ value: t.value, label: t.label }))}
        className="mb-4"
      />
      <div className="min-h-0 flex-1">
        {activeTab === "calendar" && (
          <ContentCalendar onNewPost={handleNewPost} onEditPost={handleEditPost} />
        )}
        {activeTab === "create" && (
          <ContentCreate initialData={selectedIdea} editingPost={editingPost} />
        )}
        {activeTab === "ideas" && <ContentIdeas onUseIdea={handleUseIdea} />}
        {activeTab === "analytics" && <ContentAnalytics />}
      </div>
    </PageTransition>
  );
}
