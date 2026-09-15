import type { StrategyContent } from "../../src/validators/contentStrategy.validator";

/** A complete strategy that passes strategyContentSchema unchanged. */
export const strategyContent = (): StrategyContent => ({
  audienceAnalysis: {
    summary: "Home baristas who want café-quality coffee without the fuss.",
    segments: [
      {
        name: "Weekend brewers",
        description: "Enjoy slow mornings and experimenting with brew methods.",
        painPoints: ["Inconsistent results"],
        motivations: ["Better taste"],
        contentPreferences: ["Short how-to videos"],
      },
    ],
  },
  contentPillars: [
    {
      name: "Brewing",
      description: "Practical guides to brewing better coffee.",
      objective: "Build trust that turns into sales.",
      exampleTopics: ["Pour-over basics"],
    },
    {
      name: "Origins",
      description: "Where the beans come from.",
      objective: "Show quality and care.",
      exampleTopics: ["Meet the farm"],
    },
  ],
  recommendedTopics: [
    {
      title: "Dial in your grinder",
      pillar: "Brewing",
      angle: "The three most common mistakes",
      format: "CAROUSEL",
      platforms: ["INSTAGRAM"],
    },
  ],
  platformStrategy: [
    {
      platform: "INSTAGRAM",
      role: "Main channel",
      audienceFit: "A visual audience that saves tutorials.",
      contentFocus: "Tutorials and behind the scenes",
      formats: ["CAROUSEL", "SHORT_VIDEO"],
    },
  ],
  brandTone: {
    summary: "A friendly expert who never talks down.",
    voiceAttributes: ["Friendly", "Clear"],
    dos: ["Explain simply"],
    donts: ["Use jargon"],
    examplePhrases: ["Let's brew something great."],
  },
  ctaStrategy: {
    summary: "Soft calls to action on educational posts, direct ones on product posts.",
    primaryGoal: "SALES",
    ctas: [{ text: "Shop the new roast [link]", goal: "SALES", placement: "End of product posts" }],
  },
  postingFrequency: {
    summary: "Three posts a week is sustainable.",
    postsPerWeek: 3,
    platforms: [
      {
        platform: "INSTAGRAM",
        postsPerWeek: 3,
        bestDays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
        timing: "Mornings; adjust with analytics",
      },
    ],
  },
  contentFormats: [
    { format: "CAROUSEL", sharePercent: 60, purpose: "Teach" },
    { format: "SHORT_VIDEO", sharePercent: 40, purpose: "Reach new people" },
  ],
  hashtagApproach: {
    summary: "A few focused hashtags at the end of each post.",
    minPerPost: 3,
    maxPerPost: 8,
    branded: ["#AcmeCoffee"],
    community: ["#homebarista"],
    niche: ["#pourover"],
    guidelines: ["Put hashtags at the end"],
  },
});
