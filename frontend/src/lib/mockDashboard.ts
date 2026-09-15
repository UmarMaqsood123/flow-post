import { BRAND_GOAL_OPTIONS, optionLabel, SOCIAL_PLATFORM_OPTIONS } from "@/config/brandProfile";
import { paths } from "@/routing/paths";
import type { BrandProfile, SocialPlatform } from "@/types/brandProfile";
import type {
  AiRecommendation,
  DashboardPost,
  DashboardSummary,
  DailyEngagement,
} from "@/types/dashboard";
import { createRandom, hashString } from "./mock";

/**
 * TEMPORARY sample dashboard data, used until analytics and social integrations
 * exist. Seeded by workspace and day so numbers don't jump around between
 * refreshes, and personalised with the brand profile where one is filled in.
 */

interface MockDashboardOptions {
  workspaceId: string;
  workspaceName: string;
  brandProfile?: BrandProfile;
  canEditBrandProfile: boolean;
  /** Produce a brand-new workspace with nothing connected or posted. */
  empty?: boolean;
  now?: Date;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEFAULT_PLATFORMS: SocialPlatform[] = ["LINKEDIN", "INSTAGRAM", "FACEBOOK"];
const FALLBACK_TOPICS = ["industry trends", "customer stories", "practical tips"];
const CAPTIONS = [
  "3 quick tips to get more out of {topic}",
  "Behind the scenes: how we approach {topic}",
  "Why {business} customers keep coming back",
  "Myth vs. fact: {topic}",
  "A closer look at {product}",
  "Your questions about {topic}, answered",
  "This week's roundup on {topic}",
  "Meet the team behind {product}",
];

const toHashtag = (value: string) => {
  const words = value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length ? `#${words.map((word) => word.toLowerCase()).join("")}` : null;
};

export function generateMockDashboard({
  workspaceId,
  workspaceName,
  brandProfile,
  canEditBrandProfile,
  empty = false,
  now = new Date(),
}: MockDashboardOptions): DashboardSummary {
  const random = createRandom(hashString(`${workspaceId}:${now.toISOString().slice(0, 10)}`));
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

  const topics = brandProfile?.topics.length
    ? brandProfile.topics
    : brandProfile?.keywords.length
      ? brandProfile.keywords
      : FALLBACK_TOPICS;
  const products = brandProfile?.productsServices.length
    ? brandProfile.productsServices
    : ["our latest offer"];
  const platforms = brandProfile?.preferredPlatforms.length
    ? brandProfile.preferredPlatforms
    : DEFAULT_PLATFORMS;
  const businessName = brandProfile?.businessName || workspaceName;

  // ── Recommendations ─────────────────────────────────────
  const recommendations: AiRecommendation[] = [];
  if (canEditBrandProfile && brandProfile?.onboarding.status !== "COMPLETED") {
    recommendations.push({
      id: "profile",
      kind: "profile",
      title: "Finish your brand profile",
      description:
        "Suggestions get more specific once FlowPost knows your audience, goals and voice.",
      actionLabel: "Continue setup",
      actionTo: paths.brandProfile,
    });
  }
  if (empty) {
    recommendations.push({
      id: "connect",
      kind: "connect",
      title: "Connect your social accounts",
      description: "Publishing and real analytics start once your accounts are connected.",
      actionLabel: "View social accounts",
      actionTo: paths.socialAccounts,
    });
  }
  const topic = pick(topics);
  const goal = brandProfile?.primaryGoal
    ? optionLabel(BRAND_GOAL_OPTIONS, brandProfile.primaryGoal).toLowerCase()
    : null;
  recommendations.push({
    id: "content-idea",
    kind: "content_idea",
    title: `Share a quick guide on ${topic}`,
    description: goal
      ? `Helpful, practical posts support your goal to ${goal}.`
      : "Helpful, practical posts tend to earn more saves and shares.",
    actionLabel: "Create with AI",
    actionTo: `${paths.aiCreate}?idea=${encodeURIComponent(`A quick guide on ${topic}`)}`,
  });
  recommendations.push({
    id: "best-time",
    kind: "best_time",
    title: `Post on ${optionLabel(SOCIAL_PLATFORM_OPTIONS, pick(platforms))} ${pick([
      "Tuesday",
      "Wednesday",
      "Thursday",
    ])} around ${pick(["9:00 AM", "12:30 PM", "5:00 PM"])}`,
    description: "That's when accounts like yours usually see the most engagement.",
    actionLabel: "Open calendar",
    actionTo: paths.calendar,
  });
  const hashtags = [
    ...new Set((brandProfile?.keywords.length ? brandProfile.keywords : topics).map(toHashtag)),
  ]
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 3);
  if (hashtags.length > 0) {
    recommendations.push({
      id: "hashtags",
      kind: "hashtags",
      title: `Try ${hashtags.join(" ")}`,
      description: "Relevant hashtags help new audiences discover your posts.",
      actionLabel: "Use in a post",
      actionTo: `${paths.aiCreate}?hashtags=${encodeURIComponent(hashtags.join(" "))}`,
    });
  }

  const days = (engagementFor: (index: number) => number): DailyEngagement[] =>
    Array.from({ length: 14 }, (_, index) => ({
      date: new Date(now.getTime() - (13 - index) * DAY).toISOString().slice(0, 10),
      engagements: engagementFor(index),
    }));

  if (empty) {
    return {
      isSample: true,
      stats: {
        connectedAccounts: 0,
        postsThisMonth: { value: 0, previous: 0 },
        scheduledPosts: 0,
        publishedPosts: { value: 0, previous: 0 },
        engagementRate: { value: 0, previous: 0 },
      },
      engagement: {
        totals: { impressions: 0, likes: 0, comments: 0, shares: 0 },
        daily: days(() => 0),
      },
      upcomingPosts: [],
      recentPosts: [],
      recommendations: recommendations.slice(0, 4),
    };
  }

  // ── Posts ───────────────────────────────────────────────
  const caption = () =>
    pick(CAPTIONS)
      .replace("{topic}", pick(topics))
      .replace("{product}", pick(products))
      .replace("{business}", businessName);
  const mediaType = () => pick(["image", "video", "text"] as const);

  const upcomingPosts: DashboardPost[] = Array.from({ length: 5 }, (_, index) => ({
    id: `upcoming-${index}`,
    platform: pick(platforms),
    caption: caption(),
    status: "scheduled",
    date: new Date(now.getTime() + (index * 20 + between(2, 14)) * HOUR).toISOString(),
    mediaType: mediaType(),
    metrics: null,
  }));

  const recentPosts: DashboardPost[] = Array.from({ length: 5 }, (_, index) => {
    const likes = between(18, 420);
    return {
      id: `recent-${index}`,
      platform: pick(platforms),
      caption: caption(),
      status: "published",
      date: new Date(now.getTime() - (index * 22 + between(1, 12)) * HOUR).toISOString(),
      mediaType: mediaType(),
      metrics: {
        likes,
        comments: between(1, Math.max(2, Math.round(likes / 8))),
        shares: between(0, Math.round(likes / 12)),
      },
    };
  });

  // ── Stats and engagement ────────────────────────────────
  const daily = days((index) => between(60, 160) + index * between(2, 9));
  const totalEngagements = daily.reduce((sum, day) => sum + day.engagements, 0);
  const published = between(12, 34);
  const scheduled = between(6, 14);
  const rate = Number((2 + random() * 4).toFixed(1));

  return {
    isSample: true,
    stats: {
      connectedAccounts: platforms.length,
      postsThisMonth: { value: published + scheduled, previous: between(12, 42) },
      scheduledPosts: scheduled,
      publishedPosts: { value: published, previous: between(8, 30) },
      engagementRate: {
        value: rate,
        previous: Number(Math.max(0.5, rate + (random() - 0.55) * 1.4).toFixed(1)),
      },
    },
    engagement: {
      totals: {
        impressions: totalEngagements * between(18, 32),
        likes: Math.round(totalEngagements * 0.74),
        comments: Math.round(totalEngagements * 0.16),
        shares: Math.round(totalEngagements * 0.1),
      },
      daily,
    },
    upcomingPosts,
    recentPosts,
    recommendations: recommendations.slice(0, 4),
  };
}
