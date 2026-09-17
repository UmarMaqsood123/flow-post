/** Tags that delimit data in prompts. Untrusted text can't open or close them. */
export const PROMPT_TAGS = [
  "brand_profile",
  "content_strategy",
  "performance_insights",
  "performance_summary",
  "performance_facts",
  "recent_content",
  "autopilot_brief",
  "platform_guidelines",
  "current_post",
  "user_request",
] as const;
export type PromptTag = (typeof PROMPT_TAGS)[number];

// Any opening or closing form of a known tag, with stray whitespace or attributes.
const TAG_PATTERN = new RegExp(`<\\s*/?\\s*(?:${PROMPT_TAGS.join("|")})\\b[^>]*>`, "gi");
// Invisible format characters (zero-width joiners and the like) could hide a tag name.
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/**
 * Removes anything that could impersonate our prompt delimiters. Look-alike
 * characters are folded (NFKC turns full-width brackets into ASCII), invisible
 * characters dropped, and removal repeats until stable so nested fragments like
 * `</user_re</user_request>quest>` can't reassemble into a real tag.
 */
export const sanitizeUntrusted = (text: string) => {
  let current = text.normalize("NFKC").replace(FORMAT_CHARACTERS, "");
  for (let pass = 0; pass < 10; pass += 1) {
    const next = current.replace(TAG_PATTERN, "");
    if (next === current) return next;
    current = next;
  }
  // Pathological input: drop every angle bracket rather than risk a surviving tag.
  return current.replace(/[<>]/g, "");
};

/** Wraps content in a data tag. The content is treated as untrusted. */
export const tagged = (tag: PromptTag, content: string) =>
  `<${tag}>\n${sanitizeUntrusted(content).trim()}\n</${tag}>`;

/** Joins prompt sections, skipping empty ones. */
export const sections = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((part): part is string => Boolean(part)).join("\n\n");

/** Joins request lines, skipping empty ones. */
export const lines = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((part): part is string => Boolean(part)).join("\n");

export const bulletList = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
