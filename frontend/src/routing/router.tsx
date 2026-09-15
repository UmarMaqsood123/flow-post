import { BarChart3, CalendarDays, FileText } from "lucide-react";
import { createBrowserRouter, Navigate } from "react-router";
import AppLayout from "@/components/layouts/AppLayout";
import AuthLayout from "@/components/layouts/AuthLayout";
import MarketingLayout from "@/components/layouts/MarketingLayout";
import RootLayout from "@/components/layouts/RootLayout";
import RouteError from "@/components/shared/RouteError";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import Login from "@/pages/auth/Login";
import ResetPassword from "@/pages/auth/ResetPassword";
import Signup from "@/pages/auth/Signup";
import VerifyEmail from "@/pages/auth/VerifyEmail";
import ComingSoon from "@/pages/ComingSoon";
import Dashboard from "@/pages/dashboard/Dashboard";
import Home from "@/pages/Home";
import AcceptInvitation from "@/pages/invitations/AcceptInvitation";
import NotFound from "@/pages/NotFound";
import AccountSettings from "@/pages/settings/AccountSettings";
import CreateWorkspace from "@/pages/workspaces/CreateWorkspace";
import TeamMembers from "@/pages/workspaces/TeamMembers";
import WorkspaceFiles from "@/pages/workspaces/WorkspaceFiles";
import Workspaces from "@/pages/workspaces/Workspaces";
import WorkspaceSettings from "@/pages/workspaces/WorkspaceSettings";
import GuestRoute from "./GuestRoute";
import { paths } from "./paths";
import ProtectedRoute from "./ProtectedRoute";
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

      // Signed-in application (sidebar + navbar)
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: paths.dashboard, element: <Dashboard />, handle: titled("Dashboard") },
              {
                path: paths.calendar,
                handle: titled("Calendar"),
                element: (
                  <ComingSoon
                    title="Content calendar"
                    description="Plan and schedule posts across every platform."
                    icon={CalendarDays}
                  />
                ),
              },
              {
                path: paths.posts,
                handle: titled("Posts"),
                element: (
                  <ComingSoon
                    title="Posts"
                    description="Draft, review and manage AI-assisted posts."
                    icon={FileText}
                  />
                ),
              },
              {
                path: paths.analytics,
                handle: titled("Analytics"),
                element: (
                  <ComingSoon
                    title="Analytics"
                    description="See how your content performs on each platform."
                    icon={BarChart3}
                  />
                ),
              },
              { path: paths.workspaces, element: <Workspaces />, handle: titled("Workspaces") },
              {
                path: paths.createWorkspace,
                element: <CreateWorkspace />,
                handle: titled("New workspace"),
              },
              {
                path: paths.accountSettings,
                element: <AccountSettings />,
                handle: titled("Account settings"),
              },
              {
                path: paths.changePassword,
                element: <Navigate to={paths.accountSettings} replace />,
              },

              // Pages that act on the current workspace
              {
                element: <RequireWorkspace />,
                children: [
                  {
                    path: paths.workspaceFiles,
                    element: <WorkspaceFiles />,
                    handle: titled("Files"),
                  },
                  {
                    path: paths.workspaceMembers,
                    element: <TeamMembers />,
                    handle: titled("Team members"),
                  },
                  {
                    path: paths.workspaceSettings,
                    element: <WorkspaceSettings />,
                    handle: titled("Workspace settings"),
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
