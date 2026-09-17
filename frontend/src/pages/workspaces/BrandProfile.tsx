import BrandProfileReview from "@/components/onboarding/BrandProfileReview";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import PageHeader from "@/components/shared/PageHeader";
import PageLoader from "@/components/shared/PageLoader";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { hasMinimumRole } from "@/lib/workspaceRoles";
import useBrandProfile from "@/services/brandProfile/useBrandProfile";
import useCurrentWorkspace from "@/services/workspace/useCurrentWorkspace";

function BrandProfilePage() {
  const { current } = useCurrentWorkspace();
  const brandProfile = useBrandProfile(current?.workspace.id);

  // RequireWorkspace guarantees a current workspace; this narrows the type.
  if (!current) return null;

  const { workspace } = current;
  const canEdit = hasMinimumRole(current.role, "ADMIN");
  const profile = brandProfile.data;
  const isSettingUp = canEdit && profile?.onboarding.status !== "COMPLETED";

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title={isSettingUp ? "Set up your brand profile" : "Brand profile"}
        description={
          isSettingUp
            ? `Answer a few questions about ${workspace.name} so FlowPost can tailor your content. Your progress is saved as you go.`
            : `What FlowPost knows about ${workspace.name}.`
        }
      />

      {brandProfile.isPending && <PageLoader label="Loading brand profile…" />}
      {brandProfile.isError && (
        <Alert variant="error" title="We couldn't load the brand profile">
          <Button
            className="mt-3"
            onClick={() => brandProfile.refetch()}
            isLoading={brandProfile.isRefetching}
          >
            Retry
          </Button>
        </Alert>
      )}

      {profile &&
        (canEdit ? (
          // Keyed so switching workspaces starts a fresh form.
          <OnboardingWizard key={workspace.id} workspaceId={workspace.id} profile={profile} />
        ) : (
          <>
            <Alert variant="info">
              {profile.onboarding.status === "COMPLETED"
                ? "Only admins and owners can edit the brand profile."
                : "An admin or owner hasn't finished setting up the brand profile yet."}
            </Alert>
            <BrandProfileReview profile={profile} />
          </>
        ))}
    </div>
  );
}

export default BrandProfilePage;
