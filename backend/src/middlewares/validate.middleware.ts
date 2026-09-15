import type { RequestHandler } from "express";
import type { ZodType } from "zod";

interface RequestSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Parses request parts with zod and replaces them with the parsed (trimmed,
 * normalized, unknown-keys-stripped) values. A ZodError is turned into a 422
 * response by the central error handler.
 */
export const validate =
  (schemas: RequestSchemas): RequestHandler =>
  async (req, _res, next) => {
    if (schemas.body) {
      req.body = await schemas.body.parseAsync(req.body ?? {});
    }
    if (schemas.params) {
      req.params = (await schemas.params.parseAsync(req.params)) as typeof req.params;
    }
    if (schemas.query) {
      // Express 5 exposes `req.query` as a getter, so it must be redefined rather than assigned.
      Object.defineProperty(req, "query", {
        value: await schemas.query.parseAsync(req.query),
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
