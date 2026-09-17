/**
 * What happened → who hears about it. Each function is safe to call from any
 * flow: `notify` never throws, and lookups here are wrapped the same way.
 */
import type { Types } from "mongoose";
import { logger } from "../config/logger";
import { PLAN_DEFINITIONS, type PlanValue } from "../constants/billing.constant";
import type { WorkspaceRoleValue } from "../constants/workspace.constant";
import { AutopilotSettings } from "../models/autopilotSettings.model";
import { Post } from "../models/post.model";
import { notify, workspaceAdmins } from "./notification.service";

const unscoped = { skipWorkspaceScope: true } as const;

const PLATFORM_NAMES: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
};
const platformName = (platform: string) => PLATFORM_NAMES[platform] ?? platform;

const guarded =
  <A extends unknown[]>(name: string, fn: (...args: A) => Promise<void>) =>
  async (...args: A) => {
    try {
      await fn(...args);
    } catch (error) {
      logger.error({ err: error, event: name }, "Couldn't prepare a notification");
    }
  };

const postSummary = (post: { brief?: { topic?: string } | null }) => {
  const label = (post.brief?.topic ?? "").trim();
  return label ? `“${label.length > 80 ? `${label.slice(0, 79)}…` : label}”` : "Your post";
};

const loadPost = (postId: Types.ObjectId) =>
  Post.findById(postId)
    .select("workspace platform brief.topic createdBy")
    .setOptions(unscoped)
    .lean();

export const postPublished = guarded(
  "post-published",
  async (scheduleId: Types.ObjectId, postId: Types.ObjectId) => {
    const post = await loadPost(postId);
    if (!post) return;
    await notify({
      recipients: [post.createdBy],
      workspace: post.workspace,
      type: "POST_PUBLISHED",
      title: `Published on ${platformName(post.platform)}`,
      body: `${postSummary(post)} is live.`,
      href: `/create?post=${post._id.toString()}`,
      dedupeKey: `published:${scheduleId.toString()}`,
    });
  },
);

export const postFailed = guarded(
  "post-failed",
  async (
    scheduleId: Types.ObjectId,
    postId: Types.ObjectId,
    failure: { message: string },
    needsReview: boolean,
  ) => {
    const post = await loadPost(postId);
    if (!post) return;
    const admins = await workspaceAdmins(post.workspace);
    await notify({
      recipients: [post.createdBy, ...admins],
      workspace: post.workspace,
      type: "POST_FAILED",
      title: needsReview
        ? `Check ${platformName(post.platform)}: publish result unknown`
        : `Couldn't publish to ${platformName(post.platform)}`,
      body: `${postSummary(post)}: ${failure.message}`,
      href: `/create?post=${post._id.toString()}`,
      dedupeKey: `failed:${scheduleId.toString()}`,
    });
  },
);

export const autopilotPaused = guarded(
  "autopilot-paused",
  async (workspace: Types.ObjectId, reason: string, pausedAt: Date) => {
    const [admins, settings] = await Promise.all([
      workspaceAdmins(workspace),
      AutopilotSettings.findOne({ workspace }).select("startedBy").lean(),
    ]);
    await notify({
      recipients: [settings?.startedBy, ...admins],
      workspace,
      type: "AUTOPILOT_PAUSED",
      title: "Autopilot paused itself",
      body: reason,
      href: "/autopilot",
      dedupeKey: `autopilot-paused:${workspace.toString()}:${pausedAt.getTime()}`,
    });
  },
);

/** Once per Autopilot slot, however many platform posts it holds. */
export const autopilotNeedsReview = guarded(
  "autopilot-review",
  async (workspace: Types.ObjectId, slot: Types.ObjectId, reason: string) => {
    const [admins, settings] = await Promise.all([
      workspaceAdmins(workspace),
      AutopilotSettings.findOne({ workspace }).select("startedBy").lean(),
    ]);
    await notify({
      recipients: [settings?.startedBy, ...admins],
      workspace,
      type: "AUTOPILOT_APPROVAL_NEEDED",
      title: "Autopilot posts need your review",
      body: reason,
      href: "/autopilot",
      dedupeKey: `autopilot-review:${slot.toString()}`,
    });
  },
);

/** Once per connection per status: reconnecting starts a new round. */
export const socialAccountNeedsAttention = guarded(
  "social-account",
  async (
    account: {
      _id: Types.ObjectId;
      workspace: Types.ObjectId;
      platform: string;
      accountName?: string | null;
      status: string;
      lastConnectedAt: Date;
    },
    message: string,
  ) => {
    const name = account.accountName ? ` (${account.accountName})` : "";
    await notify({
      recipients: await workspaceAdmins(account.workspace),
      workspace: account.workspace,
      type: "SOCIAL_ACCOUNT_NEEDS_ATTENTION",
      title: `Reconnect ${platformName(account.platform)}${name}`,
      body: message,
      href: "/social-accounts",
      dedupeKey: `social:${account._id.toString()}:${account.status}:${account.lastConnectedAt.getTime()}`,
    });
  },
);

export const invitationAccepted = guarded(
  "invitation-accepted",
  async (
    invitation: { _id: Types.ObjectId; invitedBy: Types.ObjectId | null },
    workspace: { _id: Types.ObjectId; name: string },
    member: { name: string },
    role: WorkspaceRoleValue,
  ) => {
    await notify({
      recipients: [invitation.invitedBy],
      workspace: workspace._id,
      type: "INVITATION_ACCEPTED",
      title: `${member.name} joined ${workspace.name}`,
      body: `They accepted your invitation as ${role.toLowerCase()}.`,
      href: "/team",
      dedupeKey: `invitation:${invitation._id.toString()}`,
    });
  },
);

export const memberRoleChanged = guarded(
  "member-role",
  async (
    member: Types.ObjectId,
    workspace: { _id: Types.ObjectId; name: string },
    role: WorkspaceRoleValue,
  ) => {
    await notify({
      recipients: [member],
      workspace: workspace._id,
      type: "MEMBER_ROLE_CHANGED",
      title: `Your role in ${workspace.name} changed`,
      body: `You're now ${role === "ADMIN" || role === "OWNER" ? "an" : "a"} ${role.toLowerCase()}.`,
      href: "/team",
    });
  },
);

/** Account-level: the person no longer sees the workspace, so it can't hold this one. */
export const memberRemoved = guarded(
  "member-removed",
  async (member: Types.ObjectId, workspace: { name: string }) => {
    await notify({
      recipients: [member],
      workspace: null,
      type: "MEMBER_REMOVED",
      title: `You were removed from ${workspace.name}`,
      body: "You no longer have access to this workspace.",
      href: "/workspaces",
    });
  },
);

export const paymentFailed = guarded(
  "payment-failed",
  async (user: Types.ObjectId, plan: PlanValue, message: string, failedAt: Date) => {
    await notify({
      recipients: [user],
      workspace: null,
      type: "PAYMENT_FAILED",
      title: `Payment failed for your ${PLAN_DEFINITIONS[plan].label} plan`,
      body: message,
      href: "/billing",
      dedupeKey: `payment-failed:${user.toString()}:${failedAt.getTime()}`,
    });
  },
);

export const insightsReady = guarded(
  "insights-ready",
  async (workspace: Types.ObjectId, weekStart: string) => {
    await notify({
      recipients: await workspaceAdmins(workspace),
      workspace,
      type: "INSIGHTS_READY",
      title: "Your weekly performance insights are ready",
      body: "See what worked last week and approve recommendations for AI writing.",
      href: "/analytics",
      dedupeKey: `insights:${workspace.toString()}:${weekStart}`,
    });
  },
);
