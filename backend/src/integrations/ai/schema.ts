import { z } from "zod";
import type { StructuredOutputSchema } from "./types";

/**
 * Keywords outside the strict structured-output subset. Constraints like
 * lengths are still enforced by the zod schema when the response is parsed.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "title",
  "default",
  "examples",
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
]);

/** Keys whose value is a map of name → schema (not a schema itself). */
const SCHEMA_MAPS = new Set(["properties", "$defs", "definitions"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalize = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(normalize);
  if (!isRecord(node)) return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    result[key] =
      SCHEMA_MAPS.has(key) && isRecord(value)
        ? Object.fromEntries(
            Object.entries(value).map(([name, schema]) => [name, normalize(schema)]),
          )
        : normalize(value);
  }

  // Strict mode: every property is required and no extra properties are allowed.
  // Output schemas therefore express "optional" as nullable, never as optional.
  if (result.type === "object" || isRecord(result.properties)) {
    const properties = isRecord(result.properties) ? result.properties : {};
    result.properties = properties;
    result.required = Object.keys(properties);
    result.additionalProperties = false;
  }
  return result;
};

/** Converts a zod object schema into a strict structured-output schema. Avoid transforms and `.optional()`. */
export const createStructuredSchema = <T>(
  name: string,
  schema: z.ZodType<T>,
): StructuredOutputSchema<T> => ({
  name,
  // The input side: cleaning transforms (trimming, clipping) run after the model responds.
  jsonSchema: normalize(z.toJSONSchema(schema, { io: "input" })) as Record<string, unknown>,
  parse: (value) => schema.parse(value),
});
