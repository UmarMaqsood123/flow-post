import {
  Bot,
  CalendarDays,
  ChartColumn,
  CreditCard,
  FileText,
  Share2,
  WandSparkles,
} from "lucide-react";
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
import ComingSoon from "@/pages/ComingSoon";
import Dashboard from "@/pages/dashboard/Dashboard";
import Home from "@/pages/Home";
import AcceptInvitation from "@/pages/invitations/AcceptInvitation";
import NotFound from "@/pages/NotFound";
import AccountSettings from "@/pages/settings/AccountSettings";
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
import RequireWorkspace from "./RequireWorkspace";
import type { RouteHandle } from "./routeHandle";

const titled = (title: string): RouteHandle => ({ title });

/** Sections that aren't built yet. */
const placeholderRoutes = [
  {
    path: paths.aiCreate,
    title: "AI Create",
    element: (
      <ComingSoon
        title="AI Create"
        description="Generate on-brand posts from your brand profile."
        icon={WandSparkles}
        features={[
          "Draft posts in your brand voice for each platform",
          "Turn one idea into captions for every channel",
          "Suggest hashtags, hooks and calls to action",
          "Save drafts for your team to review",
        ]}
      />
    ),
  },
  {
    path: paths.content,
    title: "Content",
    element: (
      <ComingSoon
        title="Content"
        description="Draft, review and manage every post in one place."
        icon={FileText}
        features={[
          "Drafts, scheduled and published posts together",
          "Approval workflow for editors and admins",
          "Filter by platform, status and campaign",
        ]}
      />
    ),
  },
  {
    path: paths.calendar,
    title: "Calendar",
    element: (
      <ComingSoon
        title="Calendar"
        description="Plan and schedule posts across every platform."
        icon={CalendarDays}
        features={[
          "Week and month views in your workspace time zone",
          "Drag and drop to reschedule",
          "Best-time suggestions for each platform",
        ]}
      />
    ),
  },
  {
    path: paths.socialAccounts,
    title: "Social accounts",
    element: (
      <ComingSoon
        title="Social Accounts"
        description="Connect the profiles FlowPost publishes to."
        icon={Share2}
        note="Social integrations aren't available yet, so the dashboard shows sample data."
        features={[
          "LinkedIn, Instagram, Facebook, X, TikTok, YouTube, Pinterest and Threads",
          "Connection health and reconnect reminders",
          "Choose which teammates can publish to each account",
        ]}
      />
    ),
  },
  {
    path: paths.analytics,
    title: "Analytics",
    element: (
      <ComingSoon
        title="Analytics"
        description="See how your content performs on each platform."
        icon={ChartColumn}
        features={[
          "Reach, engagement and follower growth over time",
          "Top-performing posts and formats",
          "Exportable reports for clients and stakeholders",
        ]}
      />
    ),
  },
  {
    path: paths.autopilot,
    title: "Autopilot",
    element: (
      <ComingSoon
        title="Autopilot"
        description="Keep your channels active with AI-planned posting."
        icon={Bot}
        features={[
          "Plan a week of posts from your brand profile",
          "Posting limits and quiet hours you control",
          "Nothing goes live without approval unless you allow it",
        ]}
      />
    ),
  },
  {
    path: paths.billing,
    title: "Billing",
    element: (
      <ComingSoon
        title="Billing"
        description="Manage your plan, seats and invoices."
        icon={CreditCard}
        features={["Plans and usage", "Invoices and payment methods", "Seat management"]}
      />
    ),
  },
];

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
              ...placeholderRoutes.map(({ path, title, element }) => ({
                path,
                element,
                handle: titled(title),
              })),
              { path: paths.workspaces, element: <Workspaces />, handle: titled("Workspaces") },
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
