import type { Request } from "express";
import type { Types } from "mongoose";
import { logger } from "../config/logger";
import type {
  AuditActionValue,
  AuditSourceValue,
  AuditTargetTypeValue,
} from "../constants/audit.constant";
import { AuditLog } from "../models/auditLog.model";
import type { UserDocument } from "../models/user.model";

export interface AuditInput {
  action: AuditActionValue;
  actor: Pick<UserDocument, "_id" | "email"> | null;
  targetType: AuditTargetTypeValue;
  targetId: Types.ObjectId;
  targetLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: AuditSourceValue;
  request?: Request;
}

/**
 * Writes an audit record and waits for it. Unlike activity logs, a failed write
 * fails the action: a sensitive action must not happen without its record.
 */
export const record = async ({
  action,
  actor,
  targetType,
  targetId,
  targetLabel = null,
  reason = null,
  metadata = null,
  source = "ADMIN_PANEL",
  request,
}: AuditInput) => {
  const entry = await AuditLog.create({
    action,
    actor: actor?._id ?? null,
    actorEmail: actor?.email ?? null,
    targetType,
    targetId,
    targetLabel: targetLabel?.slice(0, 300) ?? null,
    reason,
    metadata,
    source,
    ip: request?.ip ?? null,
    userAgent: request?.get("user-agent")?.slice(0, 512) ?? null,
    requestId: request ? String(request.id ?? "") || null : null,
  });
  logger.info(
    {
      auditId: entry.id,
      action,
      actorId: actor?._id.toString() ?? null,
      targetType,
      targetId: targetId.toString(),
    },
    "Audit record written",
  );
  return entry;
};
