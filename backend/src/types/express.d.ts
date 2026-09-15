import type { UserDocument } from "../models/user.model";
import type { WorkspaceDocument } from "../models/workspace.model";
import type { WorkspaceMemberDocument } from "../models/workspaceMember.model";

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: UserDocument;
      /** Set by `requireWorkspace()` — the workspace the user is authorized to access. */
      workspace?: WorkspaceDocument;
      /** Set by `requireWorkspace()` — the user's membership (and role) in `workspace`. */
      workspaceMember?: WorkspaceMemberDocument;
    }
  }
}

export {};
