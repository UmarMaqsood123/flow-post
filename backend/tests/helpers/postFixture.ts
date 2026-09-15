import type { CreatePlatformValue } from "../../src/constants/post.constant";
import type { PostContent, PostDraft } from "../../src/validators/post.validator";

export const postContent = (overrides: Partial<PostContent> = {}): PostContent => ({
  title: null,
  hook: "Fresh beans taste better.",
  body: "Here's why grind size matters more than the machine.",
  text: "Fresh beans taste better.\n\nHere's why grind size matters more than the machine.\n\nShop the roast [link]\n\n#coffee",
  cta: "Shop the roast [link]",
  script: [],
  visualIdea: null,
  hashtags: ["#coffee"],
  ...overrides,
});

/** A draft as the model would return it, with every field filled in. */
export const postDraft = (
  platform: CreatePlatformValue,
  overrides: Partial<PostContent> = {},
): PostDraft => ({
  platform,
  ...postContent({
    title: `${platform} title`,
    visualIdea: `${platform} visual`,
    script: [{ scene: "Close-up of the grinder", voiceover: "Start with fresh beans." }],
    text: `${platform} text about fresh coffee`,
    ...overrides,
  }),
});
