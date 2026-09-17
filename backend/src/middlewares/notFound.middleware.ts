import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/appError.util";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  // Path only: query strings can hold tokens, and this message is logged.
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
};
