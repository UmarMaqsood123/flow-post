import { Router } from "express";
import * as ContactController from "../controllers/contact.controller";
import { contactRateLimiter } from "../middlewares/rateLimiter.middleware";
import { validate } from "../middlewares/validate.middleware";
import { createContactMessageSchema } from "../validators/contact.validator";

/** /api/v1/contact: the public Contact page form. No sign-in needed. */
const ContactRouter = Router();

ContactRouter.post(
  "/",
  contactRateLimiter,
  validate({ body: createContactMessageSchema }),
  ContactController.CreateContactMessage,
);

export { ContactRouter };
