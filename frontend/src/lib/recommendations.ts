import { BRAND_GOAL_OPTIONS, optionLabel } from "@/config/brandProfile";
import { paths } from "@/routing/paths";
import type { BrandProfile } from "@/types/brandProfile";
import type { AiRecommendation } from "@/types/dashboard";

const toHashtag = (value: string) => {
  const cleaned = value.replace(/[^\p{L}\p{N}]+/gu, "");
  return cleaned ? `#${cleaned}` : null;
};

interface RecommendationInput {
  brandProfile?: BrandProfile;
  canEditBrandProfile: boolean;
  connectedAccounts: number;
  /** The real best posting slot from analytics, when there is one. */
  bestTime?: { weekday: number; hour: number } | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Suggestions drawn from the workspace's own brand profile and measured
 * results. Nothing here invents a number: the posting-time suggestion only
 * appears once analytics have actually found a best slot.
 */
export const buildRecommendations = ({
  brandProfile,
  canEditBrandProfile,
  connectedAccounts,
  bestTime,
}: RecommendationInput): AiRecommendation[] => {
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

  if (connectedAccounts === 0) {
    recommendations.push({
      id: "connect",
      kind: "connect",
      title: "Connect your social accounts",
      description: "Publishing and analytics start once your accounts are connected.",
      actionLabel: "View social accounts",
      actionTo: paths.socialAccounts,
    });
  }

  const topic = brandProfile?.topics?.[0];
  if (topic) {
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
  }

  if (bestTime) {
    recommendations.push({
      id: "best-time",
      kind: "best_time",
      title: `Your posts do best on ${WEEKDAYS[bestTime.weekday]} around ${String(bestTime.hour).padStart(2, "0")}:00`,
      description: "Measured from the posts FlowPost has published for you so far.",
      actionLabel: "Open calendar",
      actionTo: paths.calendar,
    });
  }

  const hashtags = [...new Set((brandProfile?.keywords ?? []).map(toHashtag))]
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

  return recommendations;
};
