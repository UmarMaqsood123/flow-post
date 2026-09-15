import type { Query, Schema } from "mongoose";

const SCOPED_QUERY_OPERATIONS = [
  "countDocuments",
  "deleteMany",
  "deleteOne",
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "replaceOne",
  "updateMany",
  "updateOne",
] as const;

export interface WorkspaceScopeOptions {
  /**
   * Opt out of the guard for a query that is intentionally not scoped to one
   * workspace (e.g. listing the current user's own memberships, or resolving
   * an invitation by its secret token). Always leave a comment explaining why.
   */
  skipWorkspaceScope?: boolean;
}

/**
 * Defense in depth for multi-tenancy: any query on a workspace-owned model that
 * does not filter by `workspace` throws instead of silently reading or writing
 * across tenants. Apply to every model that has a `workspace` field.
 *
 * Note: aggregation pipelines are not covered — always `$match` on workspace first.
 */
export const workspaceScopedPlugin = (schema: Schema): void => {
  schema.pre(
    [...SCOPED_QUERY_OPERATIONS],
    { document: false, query: true },
    function (this: Query<unknown, unknown>) {
      const options = this.getOptions() as WorkspaceScopeOptions;
      if (options.skipWorkspaceScope) return;

      const filter = this.getFilter();
      if (filter.workspace === undefined || filter.workspace === null) {
        // `op` exists at runtime but isn't in Mongoose's public typings.
        const operation = (this as unknown as { op?: string }).op ?? "query";
        throw new Error(
          `Unscoped ${operation} on ${this.model.modelName}: workspace-owned queries must filter by workspace`,
        );
      }
    },
  );
};
