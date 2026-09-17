import { useState } from "react";
import ChangePasswordForm from "@/components/account/ChangePasswordForm";
import { ConfirmModal } from "@/components/modals";
import PageHeader from "@/components/shared/PageHeader";
import SettingsCard from "@/components/shared/SettingsCard";
import Button from "@/components/ui/Button";
import useLogoutAll from "@/services/auth/useLogoutAll";
import useResendVerification from "@/services/auth/useResendVerification";
import useSession from "@/services/auth/useSession";
import { notify } from "@/lib/toast";

function AccountSettings() {
  const { data: user } = useSession();
  const resendVerification = useResendVerification();
  const logoutAll = useLogoutAll();
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  // ProtectedRoute guarantees a user; this narrows the type.
  if (!user) return null;

  const handleLogoutAll = () => {
    logoutAll.reset();
    setIsLogoutOpen(true);
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
                    onClick={() =>
                      resendVerification.mutate(undefined, {
                        onSuccess: () =>
                          notify.success(`Verification email sent to ${user.email}.`),
                        onError: (error) => notify.error(error),
                      })
                    }
                    isLoading={resendVerification.isPending}
                    disabled={resendVerification.isSuccess}
                  >
                    {resendVerification.isSuccess ? "Email sent" : "Resend verification email"}
                  </Button>
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
        <ConfirmModal
          open={isLogoutOpen}
          tone="danger"
          title="Log out of all devices?"
          message="You'll be signed out of FlowPost everywhere, including this device, and will need to sign in again."
          confirmLabel="Log out everywhere"
          isLoading={logoutAll.isPending}
          error={logoutAll.error}
          onConfirm={() => logoutAll.mutate()}
          onClose={() => setIsLogoutOpen(false)}
        />
      </SettingsCard>
    </div>
  );
}

export default AccountSettings;
