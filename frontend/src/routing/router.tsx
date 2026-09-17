import { createBrowserRouter, Navigate } from "react-router";
import AppLayout from "@/components/layouts/AppLayout";
import AuthLayout from "@/components/layouts/AuthLayout";
import MarketingLayout from "@/components/layouts/MarketingLayout";
import RootLayout from "@/components/layouts/RootLayout";
import SettingsLayout from "@/components/layouts/SettingsLayout";
import RouteError from "@/components/shared/RouteError";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import Login from "@/pages/auth/Login";
import ResetPassword from "@/pages/auth/ResetPassword";
import Signup from "@/pages/auth/Signup";
import VerifyEmail from "@/pages/auth/VerifyEmail";
import AdminAIUsage from "@/pages/admin/AdminAIUsage";
import AdminAuditLog from "@/pages/admin/AdminAuditLog";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminPlans from "@/pages/admin/AdminPlans";
import AdminPublishingFailures from "@/pages/admin/AdminPublishingFailures";
import AdminSocialConnections from "@/pages/admin/AdminSocialConnections";
import AdminSubscriptionDetail from "@/pages/admin/AdminSubscriptionDetail";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminUserDetail from "@/pages/admin/AdminUserDetail";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminWorkspaceDetail from "@/pages/admin/AdminWorkspaceDetail";
import AdminWorkspaces from "@/pages/admin/AdminWorkspaces";
import Analytics from "@/pages/analytics/Analytics";
import Billing from "@/pages/billing/Billing";
import Autopilot from "@/pages/autopilot/Autopilot";
import Calendar from "@/pages/calendar/Calendar";
import Content from "@/pages/content/Content";
import AICreate from "@/pages/create/AICreate";
import Dashboard from "@/pages/dashboard/Dashboard";
import Home from "@/pages/Home";
import AcceptInvitation from "@/pages/invitations/AcceptInvitation";
import NotFound from "@/pages/NotFound";
import AccountSettings from "@/pages/settings/AccountSettings";
import SocialAccounts from "@/pages/social/SocialAccounts";
import ContentStrategy from "@/pages/strategy/ContentStrategy";
import BrandProfile from "@/pages/workspaces/BrandProfile";
import CreateWorkspace from "@/pages/workspaces/CreateWorkspace";
import TeamMembers from "@/pages/workspaces/TeamMembers";
import WorkspaceFiles from "@/pages/workspaces/WorkspaceFiles";
import Workspaces from "@/pages/workspaces/Workspaces";
import WorkspaceSettings from "@/pages/workspaces/WorkspaceSettings";
import GuestRoute from "./GuestRoute";
import LegacyRedirect from "./LegacyRedirect";
import { legacyRedirects, paths } from "./paths";
import ProtectedRoute from "./ProtectedRoute";
import RequireSuperAdmin from "./RequireSuperAdmin";
import RequireWorkspace from "./RequireWorkspace";
import type { RouteHandle } from "./routeHandle";

const titled = (title: string): RouteHandle => ({ title });

/**
 * Use `lazy` for large pages so they are code-split:
 *   { path: "reports", lazy: () => import("@/pages/reports/Reports") }
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      // Public marketing site (full-bleed layout)
      {
        path: paths.home,
        element: <MarketingLayout />,
        children: [{ index: true, element: <Home /> }],
      },

      // Auth pages and email links (simple header)
      {
        element: <RootLayout />,
        children: [
          // Signed-out only
          {
            element: <GuestRoute />,
            children: [
              {
                element: <AuthLayout />,
                children: [
                  { path: paths.login, element: <Login /> },
                  { path: paths.signup, element: <Signup /> },
                  { path: paths.forgotPassword, element: <ForgotPassword /> },
                ],
              },
            ],
          },

          // Must work whether or not the user is signed in
          {
            element: <AuthLayout />,
            children: [
              { path: paths.resetPassword, element: <ResetPassword /> },
              { path: paths.verifyEmail, element: <VerifyEmail /> },
            ],
          },

          // Signed in, but shown as a focused card rather than inside the app shell
          {
            element: <ProtectedRoute />,
            children: [
              {
                element: <AuthLayout />,
                children: [{ path: paths.acceptInvitation, element: <AcceptInvitation /> }],
              },
            ],
          },

          { path: "*", element: <NotFound /> },
        ],
      },

      // Signed-in application (sidebar + header)
      {
        element: <ProtectedRoute />,
        children: [
          ...legacyRedirects.map(({ from, to }) => ({
            path: from,
            element: <LegacyRedirect to={to} />,
          })),
          {
            element: <AppLayout />,
            children: [
              { path: paths.dashboard, element: <Dashboard />, handle: titled("Dashboard") },
              { path: paths.workspaces, element: <Workspaces />, handle: titled("Workspaces") },
              { path: paths.billing, element: <Billing />, handle: titled("Billing") },
              {
                element: <RequireSuperAdmin />,
                children: [
                  { path: paths.admin, element: <AdminDashboard />, handle: titled("Admin") },
                  {
                    path: paths.adminUsers,
                    element: <AdminUsers />,
                    handle: titled("Admin · Users"),
                  },
                  {
                    path: `${paths.adminUsers}/:userId`,
                    element: <AdminUserDetail />,
                    handle: titled("Admin · User"),
                  },
                  {
                    path: paths.adminWorkspaces,
                    element: <AdminWorkspaces />,
                    handle: titled("Admin · Workspaces"),
                  },
                  {
                    path: `${paths.adminWorkspaces}/:workspaceId`,
                    element: <AdminWorkspaceDetail />,
                    handle: titled("Admin · Workspace"),
                  },
                  {
                    path: paths.adminSubscriptions,
                    element: <AdminSubscriptions />,
                    handle: titled("Admin · Subscriptions"),
                  },
                  {
                    path: `${paths.adminSubscriptions}/:accountId`,
                    element: <AdminSubscriptionDetail />,
                    handle: titled("Admin · Subscription"),
                  },
                  {
                    path: paths.adminPlans,
                    element: <AdminPlans />,
                    handle: titled("Admin · Plans"),
                  },
                  {
                    path: paths.adminAIUsage,
                    element: <AdminAIUsage />,
                    handle: titled("Admin · AI usage"),
                  },
                  {
                    path: paths.adminSocialConnections,
                    element: <AdminSocialConnections />,
                    handle: titled("Admin · Connections"),
                  },
                  {
                    path: paths.adminPublishingFailures,
                    element: <AdminPublishingFailures />,
                    handle: titled("Admin · Publishing failures"),
                  },
                  {
                    path: paths.adminAuditLog,
                    element: <AdminAuditLog />,
                    handle: titled("Admin · Audit log"),
                  },
                ],
              },
              {
                path: paths.createWorkspace,
                element: <CreateWorkspace />,
                handle: titled("New workspace"),
              },

              // Pages that act on the current workspace
              {
                element: <RequireWorkspace />,
                children: [
                  {
                    path: paths.aiCreate,
                    element: <AICreate />,
                    handle: titled("AI Create"),
                  },
                  {
                    path: paths.content,
                    element: <Content />,
                    handle: titled("Content"),
                  },
                  {
                    path: paths.analytics,
                    element: <Analytics />,
                    handle: titled("Analytics"),
                  },
                  {
                    path: paths.autopilot,
                    element: <Autopilot />,
                    handle: titled("Autopilot"),
                  },
                  {
                    path: paths.calendar,
                    element: <Calendar />,
                    handle: titled("Calendar"),
                  },
                  {
                    path: paths.contentStrategy,
                    element: <ContentStrategy />,
                    handle: titled("Content strategy"),
                  },
                  {
                    path: paths.socialAccounts,
                    element: <SocialAccounts />,
                    handle: titled("Social accounts"),
                  },
                  {
                    path: paths.workspaceFiles,
                    element: <WorkspaceFiles />,
                    handle: titled("Media"),
                  },
                  {
                    path: paths.workspaceMembers,
                    element: <TeamMembers />,
                    handle: titled("Team"),
                  },
                ],
              },

              // Settings (shared tabs)
              {
                element: <SettingsLayout />,
                children: [
                  {
                    path: paths.settings,
                    element: <Navigate to={paths.workspaceSettings} replace />,
                  },
                  {
                    path: paths.accountSettings,
                    element: <AccountSettings />,
                    handle: titled("Account settings"),
                  },
                  {
                    element: <RequireWorkspace />,
                    children: [
                      {
                        path: paths.workspaceSettings,
                        element: <WorkspaceSettings />,
                        handle: titled("Workspace settings"),
                      },
                      {
                        path: paths.brandProfile,
                        element: <BrandProfile />,
                        handle: titled("Brand profile"),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
