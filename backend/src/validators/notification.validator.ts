import { z } from "zod";
import { objectIdField } from "./common.validator";

export const listNotificationsQuerySchema = z.object({
  workspaceId: objectIdField.optional(),
  before: z.iso.datetime({ error: "Invalid date" }).optional(),
});

export const markReadSchema = z
  .object({
    workspaceId: objectIdField.optional(),
    ids: z.array(objectIdField).min(1).max(100).optional(),
    all: z.literal(true).optional(),
  })
  .refine((body) => (body.ids ? !body.all : body.all), {
    error: "Send either ids or all: true",
  });

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
