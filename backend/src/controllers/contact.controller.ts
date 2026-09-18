import type { Request, Response } from "express";
import * as ContactService from "../services/contact.service";
import { sendCreated } from "../utils/apiResponse.util";
import type { CreateContactMessageInput } from "../validators/contact.validator";

export const CreateContactMessage = async (req: Request, res: Response) => {
  await ContactService.createContactMessage(req.body as CreateContactMessageInput, req);
  sendCreated(res, null, "Thanks for getting in touch. We'll reply by email soon.");
};
