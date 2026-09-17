import { z } from "zod";
import { FILE_KINDS, FILE_LIMITS } from "../models/file.model";
import { objectIdField } from "./common.validator";

export const fileParamsSchema = z.object({
  workspaceId: objectIdField,
  fileId: objectIdField,
});

export const listFilesQuerySchema = z.object({
  kind: z.enum(FILE_KINDS, { error: "kind must be image or document" }).optional(),
});

const optionalText = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} can be at most ${max} characters`)
    .optional()
    .transform((value) => value || undefined);

/** Name and description for one uploaded file. Both optional; the file name stands in. */
export const fileDetailsSchema = z.object({
  name: optionalText("Name", FILE_LIMITS.title),
  description: optionalText("Description", FILE_LIMITS.description),
});

/**
 * Batch uploads send one JSON `metadata` field alongside the files: an array
 * with an entry per file, in the same order the files were appended.
 */
export const batchFileDetailsSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return [];
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "metadata must be JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.array(fileDetailsSchema).max(50));

export type FileDetails = z.infer<typeof fileDetailsSchema>;
export type FileParams = z.infer<typeof fileParamsSchema>;
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;
