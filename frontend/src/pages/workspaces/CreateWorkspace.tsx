import { useMemo } from "react";
import { useNavigate } from "react-router";
import WorkspaceForm from "@/components/workspace/WorkspaceForm";
import { getBrowserTimeZone } from "@/config/workspace";
import { paths } from "@/routing/paths";
import useCreateWorkspace from "@/services/workspace/useCreateWorkspace";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";

function CreateWorkspace() {
  const createWorkspace = useCreateWorkspace();
  const { activeWorkspaces, isPending } = useCurrentWorkspace();
  const navigate = useNavigate();
  const defaultValues = useMemo(
    () => ({
      name: "",
      logo: "",
      website: "",
      industry: "",
      description: "",
      timezone: getBrowserTimeZone(),
    }),
    [],
  );

  const isFirstWorkspace = !isPending && activeWorkspaces.length === 0;

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        {isFirstWorkspace ? "Create your first workspace" : "Create a workspace"}
      </h1>
      <p className="mt-2 text-muted">
        A workspace holds one brand&apos;s social accounts, posts and team. You&apos;ll be its owner
        and can invite teammates next.
      </p>

      <div className="mt-8 rounded-xl border border-line p-5 sm:p-6">
        <WorkspaceForm
          defaultValues={defaultValues}
          submitLabel="Create workspace"
          onSubmit={async (values) => {
            await createWorkspace.mutateAsync(values);
            navigate(paths.dashboard);
          }}
        />
      </div>
    </section>
  );
}

export default CreateWorkspace;
