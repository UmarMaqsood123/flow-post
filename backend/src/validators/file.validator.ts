import { z } from "zod";
import { FILE_KINDS } from "../models/file.model";
import { objectIdField } from "./common.validator";

export const fileParamsSchema = z.object({
  workspaceId: objectIdField,
  fileId: objectIdField,
});

export const listFilesQuerySchema = z.object({
  kind: z.enum(FILE_KINDS, { error: "kind must be image or document" }).optional(),
});

export type FileParams = z.infer<typeof fileParamsSchema>;
export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;
