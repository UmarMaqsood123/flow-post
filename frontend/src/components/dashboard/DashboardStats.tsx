import { CalendarClock, FileText, Heart, Link2, Send } from "lucide-react";
import { paths } from "@/routing/paths";
import type { DashboardStats as Stats } from "@/types/dashboard";
import StatCard from "./StatCard";

interface DashboardStatsProps {
  stats?: Stats;
  isLoading: boolean;
}

function DashboardStats({ stats, isLoading }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Connected accounts"
        icon={Link2}
        isLoading={isLoading}
        value={stats?.connectedAccounts}
        hint={stats?.connectedAccounts ? "Across your platforms" : "Connect your first account"}
        to={paths.socialAccounts}
      />
      <StatCard
        label="Posts this month"
        icon={FileText}
        isLoading={isLoading}
        value={stats?.postsThisMonth.value}
        change={stats?.postsThisMonth}
        to={paths.content}
      />
      <StatCard
        label="Scheduled posts"
        icon={CalendarClock}
        isLoading={isLoading}
        value={stats?.scheduledPosts}
        hint={stats?.scheduledPosts ? "Queued to publish" : "Nothing in the queue"}
        to={paths.calendar}
      />
      <StatCard
        label="Published posts"
        icon={Send}
        isLoading={isLoading}
        value={stats?.publishedPosts.value}
        change={stats?.publishedPosts}
        to={paths.content}
      />
      <StatCard
        label="Engagement rate"
        icon={Heart}
        isLoading={isLoading}
        value={stats ? `${stats.engagementRate.value}%` : undefined}
        change={stats?.engagementRate}
        to={paths.analytics}
      />
    </div>
  );
}

export default DashboardStats;
