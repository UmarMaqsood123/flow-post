import ChangePasswordForm from "@/components/account/ChangePasswordForm";
import PageHeader from "@/components/shared/PageHeader";
import SettingsCard from "@/components/shared/SettingsCard";
import Button from "@/components/ui/Button";
import { getErrorMessage } from "@/lib/forms";
import useLogoutAll from "@/services/auth/useLogoutAll";
import useResendVerification from "@/services/auth/useResendVerification";
import useSession from "@/services/auth/useSession";

function AccountSettings() {
  const { data: user } = useSession();
  const resendVerification = useResendVerification();
  const logoutAll = useLogoutAll();

  // ProtectedRoute guarantees a user; this narrows the type.
  if (!user) return null;

  const handleLogoutAll = () => {
    if (window.confirm("Sign out of FlowPost on every device, including this one?")) {
      logoutAll.mutate();
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Account settings"
        description="Manage your profile, password and signed-in devices."
      />

      <SettingsCard title="Profile" description="Your personal account details.">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Name</dt>
            <dd className="mt-0.5 font-medium">{user.name}</dd>
          </div>
          <div>
            <dt className="text-muted">Email</dt>
            <dd className="mt-0.5 font-medium break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Email status</dt>
            <dd className="mt-0.5">
              {user.emailVerified ? (
                <span className="font-medium text-green-700">Verified</span>
              ) : (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-amber-700">Not verified</span>
                  <Button
                    variant="link"
                    onClick={() => resendVerification.mutate()}
                    isLoading={resendVerification.isPending}
                    disabled={resendVerification.isSuccess}
                  >
                    {resendVerification.isSuccess ? "Email sent" : "Resend verification email"}
                  </Button>
                </span>
              )}
              {resendVerification.isError && (
                <span className="mt-1 block text-red-700">
                  {getErrorMessage(resendVerification.error)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Member since</dt>
            <dd className="mt-0.5 font-medium">{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </SettingsCard>

      <SettingsCard
        title="Password"
        description="Changing your password signs you out on every other device."
      >
        <ChangePasswordForm />
      </SettingsCard>

      <SettingsCard
        tone="danger"
        title="Sessions"
        description="Signed in somewhere you don't recognize? Sign out everywhere, including this device."
      >
        <Button variant="danger" onClick={handleLogoutAll} isLoading={logoutAll.isPending}>
          Log out of all devices
        </Button>
        {logoutAll.isError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {getErrorMessage(logoutAll.error)}
          </p>
        )}
      </SettingsCard>
    </div>
  );
}

export default AccountSettings;
