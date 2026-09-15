import { z } from "zod";

/** A 24-character hex MongoDB ObjectId. */
export const objectIdField = z
  .string({ error: "Id is required" })
  .regex(/^[a-f\d]{24}$/i, "Invalid id");
