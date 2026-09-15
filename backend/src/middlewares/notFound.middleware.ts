import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/appError.util";

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};
