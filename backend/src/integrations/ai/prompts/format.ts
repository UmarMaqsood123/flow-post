/** Tags that delimit data in prompts. Untrusted text can't open or close them. */
const PROMPT_TAGS = [
  "brand_profile",
  "content_strategy",
  "platform_guidelines",
  "current_post",
  "user_request",
];
const TAG_PATTERN = new RegExp(`</?\\s*(?:${PROMPT_TAGS.join("|")})\\s*>`, "gi");

/** Removes anything that could impersonate our prompt delimiters. */
export const sanitizeUntrusted = (text: string) => text.replace(TAG_PATTERN, "");

/** Wraps content in a data tag. The content is treated as untrusted. */
export const tagged = (tag: (typeof PROMPT_TAGS)[number], content: string) =>
  `<${tag}>\n${sanitizeUntrusted(content).trim()}\n</${tag}>`;

/** Joins prompt sections, skipping empty ones. */
export const sections = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((part): part is string => Boolean(part)).join("\n\n");

/** Joins request lines, skipping empty ones. */
export const lines = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((part): part is string => Boolean(part)).join("\n");

export const bulletList = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
