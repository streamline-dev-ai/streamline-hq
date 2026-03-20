import { useState, useEffect, useMemo } from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";
import { 
  TrendingUp, 
  Users, 
  MousePointer2, 
  Calendar as CalendarIcon, 
  Trophy,
  Edit2,
  Check,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ContentPost, ContentPillar } from "@/types/content";
import Badge from "@/components/Badge";

export default function ContentAnalytics() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReach, setEditReach] = useState<number>(0);
  const [editEngagement, setEditEngagement] = useState<number>(0);

  useEffect(() => {
    fetchPostedContent();
  }, []);

  async function fetchPostedContent() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("content_posts")
      .select("*")
      .eq("status", "posted")
      .order("posted_at", { ascending: false });

    if (error) {
      console.error("Error fetching analytics:", error);
    } else {
      setPosts(data || []);
    }
    setIsLoading(false);
  }

  const stats = useMemo(() => {
    const totalPosts = posts.length;
    const totalReach = posts.reduce((acc, p) => acc + (p.reach || 0), 0);
    const totalEngagement = posts.reduce((acc, p) => acc + (p.engagement || 0), 0);
    const avgEngagement = totalPosts > 0 ? (totalEngagement / totalPosts).toFixed(1) : 0;
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const postsThisWeek = posts.filter(p => new Date(p.posted_at || p.created_at) > oneWeekAgo).length;

    return { totalPosts, totalReach, avgEngagement, postsThisWeek };
  }, [posts]);

  const bestPost = useMemo(() => {
    if (posts.length === 0) return null;
    return [...posts].sort((a, b) => {
      const rateA = (a.engagement || 0) / (a.reach || 1);
      const rateB = (b.engagement || 0) / (b.reach || 1);
      return rateB - rateA;
    })[0];
  }, [posts]);

  const pillarData = useMemo(() => {
    const pillars: Record<string, { name: string; engagement: number; count: number }> = {};
    posts.forEach(p => {
      if (!pillars[p.content_pillar]) {
        pillars[p.content_pillar] = { name: p.content_pillar, engagement: 0, count: 0 };
      }
      pillars[p.content_pillar].engagement += p.engagement || 0;
      pillars[p.content_pillar].count += 1;
    });

    return Object.values(pillars).map(p => ({
      name: p.name,
      avgEngagement: parseFloat((p.engagement / p.count).toFixed(1))
    })).sort((a, b) => b.avgEngagement - a.avgEngagement);
  }, [posts]);

  const updateMetrics = async (id: string) => {
    const { error } = await supabase
      .from("content_posts")
      .update({ reach: editReach, engagement: editEngagement })
      .eq("id", id);

    if (error) {
      console.error("Error updating metrics:", error);
    } else {
      setPosts(prev => prev.map(p => p.id === id ? { ...p, reach: editReach, engagement: editEngagement } : p));
      setEditingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Posts"
          value={stats.totalPosts}
          Icon={TrendingUp}
          color="text-purple"
          bg="bg-purple/10"
        />
        <MetricCard
          title="Total Reach"
          value={stats.totalReach.toLocaleString()}
          Icon={Users}
          color="text-orange"
          bg="bg-orange/10"
        />
        <MetricCard
          title="Avg Engagement"
          value={stats.avgEngagement}
          Icon={MousePointer2}
          color="text-blue-400"
          bg="bg-blue-400/10"
        />
        <MetricCard
          title="Posts This Week"
          value={stats.postsThisWeek}
          Icon={CalendarIcon}
          color="text-emerald-400"
          bg="bg-emerald-400/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Posts Table */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Performance History</h3>
          </div>
          <div className="bg-panel rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-white/5">
                    <th className="px-4 py-3 font-semibold text-zinc-400">Post Title</th>
                    <th className="px-4 py-3 font-semibold text-zinc-400">Date</th>
                    <th className="px-4 py-3 font-semibold text-zinc-400 text-right">Reach</th>
                    <th className="px-4 py-3 font-semibold text-zinc-400 text-right">Eng.</th>
                    <th className="px-4 py-3 font-semibold text-zinc-400 text-right">Rate</th>
                    <th className="px-4 py-3 font-semibold text-zinc-400"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {posts.map((post) => {
                    const isBest = bestPost?.id === post.id;
                    const engagementRate = post.reach ? ((post.engagement || 0) / post.reach * 100).toFixed(1) : "0.0";
                    const isEditing = editingId === post.id;

                    return (
                      <tr 
                        key={post.id} 
                        className={cn(
                          "group hover:bg-white/5 transition-colors",
                          isBest && "bg-orange/5"
                        )}
                      >
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white truncate max-w-[200px]">{post.title}</span>
                              {isBest && (
                                <div className="p-0.5 bg-orange/20 text-orange rounded" title="Best Performing">
                                  <Trophy className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              {post.platforms.map(p => (
                                <span key={p} className="text-[10px] text-zinc-500 uppercase">{p.slice(0, 2)}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-zinc-400 whitespace-nowrap">
                          {new Date(post.posted_at || post.created_at).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editReach}
                              onChange={(e) => setEditReach(Number(e.target.value))}
                              className="w-16 bg-base border border-border rounded px-1 py-0.5 text-right text-xs"
                            />
                          ) : (
                            <span className="text-zinc-200">{post.reach?.toLocaleString() || 0}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editEngagement}
                              onChange={(e) => setEditEngagement(Number(e.target.value))}
                              className="w-16 bg-base border border-border rounded px-1 py-0.5 text-right text-xs"
                            />
                          ) : (
                            <span className="text-zinc-200">{post.engagement?.toLocaleString() || 0}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Badge variant={Number(engagementRate) > 5 ? "emerald" : "zinc"}>
                            {engagementRate}%
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {isEditing ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => updateMetrics(post.id)} className="p-1 text-emerald-400 hover:bg-emerald-400/10 rounded">
                                <Check className="h-4 w-4" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1 text-red-400 hover:bg-red-400/10 rounded">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(post.id);
                                setEditReach(post.reach || 0);
                                setEditEngagement(post.engagement || 0);
                              }}
                              className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Charts & Breakdown */}
        <div className="flex flex-col gap-8">
          {/* Best Post Card */}
          {bestPost && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Top Performer</h3>
              <div className="bg-panel rounded-2xl border-2 border-orange/30 p-5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Trophy className="h-16 w-16 text-orange" />
                </div>
                <div className="flex flex-col gap-3 relative z-10">
                  <div className="flex items-center gap-2">
                    <Badge variant="orange" className="uppercase">Best Engagement</Badge>
                  </div>
                  <h4 className="text-lg font-bold text-white line-clamp-1">{bestPost.title}</h4>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase font-bold">Reach</div>
                      <div className="text-xl font-bold text-white">{bestPost.reach?.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase font-bold">Engagement</div>
                      <div className="text-xl font-bold text-white">{bestPost.engagement?.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pillar Chart */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Pillar Engagement</h3>
            <div className="bg-panel rounded-2xl border border-border p-5 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pillarData} layout="vertical" margin={{ left: -20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="avgEngagement" radius={[0, 4, 4, 0]}>
                    {pillarData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#7C3AED' : '#3f3f46'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, Icon, color, bg }: any) {
  return (
    <div className="bg-panel p-5 rounded-2xl border border-border flex items-center gap-4 group hover:border-border/80 transition-all">
      <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", bg, color)}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider leading-none mb-1">{title}</div>
        <div className="text-2xl font-bold text-white">{value}</div>
      </div>
    </div>
  );
}
