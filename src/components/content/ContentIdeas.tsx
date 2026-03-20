import { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  Filter, 
  Layers, 
  PlayCircle, 
  Image as ImageIcon, 
  Layout, 
  ArrowRight, 
  CheckCircle2,
  Clock,
  Lightbulb
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ContentIdea, ContentType, ContentPillar } from "@/types/content";
import Badge from "@/components/Badge";

const PILLARS: (ContentPillar | "All")[] = [
  "All",
  "Build in Public",
  "Before/After",
  "Problem/Solution",
  "Featured Build",
  "Offer",
  "Tip",
  "Social Proof"
];

const CONTENT_TYPES: (ContentType | "All")[] = ["All", "carousel", "reel", "static", "story"];

interface ContentIdeasProps {
  onUseIdea: (idea: Partial<ContentIdea>) => void;
}

export default function ContentIdeas({ onUseIdea }: ContentIdeasProps) {
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pillarFilter, setPillarFilter] = useState<ContentPillar | "All">("All");
  const [typeFilter, setTypeFilter] = useState<ContentType | "All">("All");

  useEffect(() => {
    fetchIdeas();
  }, []);

  async function fetchIdeas() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("content_ideas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching ideas:", error);
    } else {
      setIdeas(data || []);
    }
    setIsLoading(false);
  }

  const markAsUsed = async (id: string) => {
    const { error } = await supabase
      .from("content_ideas")
      .update({ used: true })
      .eq("id", id);

    if (error) {
      console.error("Error updating idea:", error);
    } else {
      setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, used: true } : idea));
    }
  };

  const filteredIdeas = useMemo(() => {
    return ideas
      .filter(idea => {
        const matchesSearch = idea.title.toLowerCase().includes(search.toLowerCase()) || 
                             idea.hook?.toLowerCase().includes(search.toLowerCase());
        const matchesPillar = pillarFilter === "All" || idea.pillar === pillarFilter;
        const matchesType = typeFilter === "All" || idea.content_type === typeFilter;
        return matchesSearch && matchesPillar && matchesType;
      })
      .sort((a, b) => {
        if (a.used === b.used) return 0;
        return a.used ? 1 : -1;
      });
  }, [ideas, search, pillarFilter, typeFilter]);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 bg-panel p-4 rounded-2xl border border-border">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search ideas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-base border border-border rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple/50 transition"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-500" />
            <div className="flex items-center gap-1 rounded-lg bg-base p-1 border border-border">
              {CONTENT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition capitalize",
                    typeFilter === t ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {PILLARS.map((p) => (
            <button
              key={p}
              onClick={() => setPillarFilter(p)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition border",
                pillarFilter === p
                  ? "bg-purple/20 border-purple text-purple"
                  : "bg-base border-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 bg-panel rounded-2xl border border-border" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIdeas.map((idea) => (
            <div
              key={idea.id}
              className={cn(
                "group relative flex flex-col gap-4 bg-panel p-5 rounded-2xl border transition-all duration-300",
                idea.used 
                  ? "border-border opacity-60 grayscale-[0.5]" 
                  : "border-border hover:border-purple/50 hover:shadow-xl hover:shadow-purple/5"
              )}
            >
              <div className="flex items-start justify-between">
                <div className={cn(
                  "p-2 rounded-xl",
                  idea.content_type === "carousel" && "bg-purple/10 text-purple",
                  idea.content_type === "reel" && "bg-orange/10 text-orange",
                  idea.content_type === "static" && "bg-white/5 text-zinc-400",
                  idea.content_type === "story" && "bg-teal-500/10 text-teal-400"
                )}>
                  {idea.content_type === "carousel" && <Layers className="h-5 w-5" />}
                  {idea.content_type === "reel" && <PlayCircle className="h-5 w-5" />}
                  {idea.content_type === "static" && <ImageIcon className="h-5 w-5" />}
                  {idea.content_type === "story" && <Layout className="h-5 w-5" />}
                </div>
                {idea.used ? (
                  <Badge variant="zinc" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Used
                  </Badge>
                ) : (
                  <Badge variant="purple" className="gap-1">
                    <Lightbulb className="h-3 w-3" />
                    Idea
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-1.5 flex-1">
                <h3 className="text-sm font-bold text-white group-hover:text-purple transition-colors">
                  {idea.title}
                </h3>
                {idea.hook && (
                  <p className="text-xs text-zinc-400 italic line-clamp-2 leading-relaxed">
                    "{idea.hook}"
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="orange">{idea.pillar}</Badge>
                <div className="flex gap-1 ml-auto">
                  {idea.platforms.map(p => (
                    <span
                      key={p}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        p === "instagram" && "bg-[#E1306C]",
                        p === "facebook" && "bg-[#1877F2]",
                        p === "linkedin" && "bg-[#0A66C2]"
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4 mt-auto border-t border-border/50">
                <button
                  onClick={() => onUseIdea(idea)}
                  disabled={idea.used}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-purple text-white rounded-xl text-xs font-bold hover:bg-purple/90 transition disabled:opacity-50"
                >
                  Use This Idea
                  <ArrowRight className="h-3 w-3" />
                </button>
                <button
                  onClick={() => markAsUsed(idea.id)}
                  disabled={idea.used}
                  className="px-3 py-2 bg-white/5 text-zinc-500 rounded-xl hover:bg-white/10 hover:text-white transition disabled:opacity-50"
                  title="Mark as Used"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {filteredIdeas.length === 0 && (
            <div className="col-span-full py-12 text-center bg-panel rounded-2xl border border-dashed border-border flex flex-col items-center gap-2">
              <Lightbulb className="h-8 w-8 text-zinc-700" />
              <div className="text-zinc-400 font-medium">No ideas found matching your filters.</div>
              <button 
                onClick={() => { setSearch(""); setPillarFilter("All"); setTypeFilter("All"); }}
                className="text-xs text-purple hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
