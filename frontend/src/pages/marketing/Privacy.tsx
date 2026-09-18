import { Link } from "react-router";
import LegalPage, { type LegalSection } from "@/components/landing/LegalPage";
import { env } from "@/config/env";
import { paths } from "@/routing/paths";

const app = env.appName;

const sections: LegalSection[] = [
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>We only collect what we need to run {app}:</p>
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address and password. Passwords are
            stored as a secure hash, so we can't read them.
          </li>
          <li>
            <strong>Workspace content:</strong> brand profiles, content strategies, briefs, posts,
            schedules and the images, videos and documents you upload.
          </li>
          <li>
            <strong>Connected accounts:</strong> the access tokens and basic profile info (like
            account name and picture) that a platform gives us when you connect it.
          </li>
          <li>
            <strong>Billing:</strong> your plan and subscription status. Card details go straight to
            Stripe.
          </li>
          <li>
            <strong>Usage and technical data:</strong> things like IP address, browser type and
            server logs, which we use to keep the service secure and fix problems.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <>
        <p>We use your information to:</p>
        <ul>
          <li>Create your account and keep you signed in</li>
          <li>Generate drafts and strategy based on your brand profile and briefs</li>
          <li>Schedule and publish posts to the accounts you connect</li>
          <li>Charge for paid plans</li>
          <li>Send account emails, like verification, password resets and team invites</li>
          <li>Prevent abuse and keep the service running</li>
        </ul>
        <p>
          We don't sell your data, and we don't use your content to show you ads. We don't use your
          content to train AI models.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>We work with a small number of service providers, and they only get what they need:</p>
        <ul>
          <li>
            <strong>OpenAI</strong> receives your brief and brand details to write drafts.
          </li>
          <li>
            <strong>Stripe</strong> handles payments.
          </li>
          <li>
            <strong>Oracle Cloud</strong> stores uploaded media files.
          </li>
          <li>
            <strong>Social platforms</strong> (LinkedIn, Meta, TikTok, Google) receive the posts you
            choose to publish to them.
          </li>
          <li>
            <strong>Email providers</strong> deliver account emails.
          </li>
        </ul>
        <p>We'll also share information if the law requires it, or to protect people from harm.</p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We only use essential cookies: one keeps you signed in, and a short-lived one protects you
        while you connect a social account. We don't use advertising or tracking cookies, and there
        are no third-party analytics scripts on {app}.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <p>
        We keep your data while your account is open. When you disconnect a social account, we
        delete its access tokens. When you delete your account, we delete your personal data and
        workspace content, except anything we have to keep for legal or billing records.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Data is encrypted in transit, passwords are hashed and access to production systems is
        limited. No system is perfectly secure, but if a breach affects your data, we'll tell you
        promptly.
      </p>
    ),
  },
  {
    id: "your-rights",
    title: "Your choices and rights",
    body: (
      <>
        <p>
          You can update your details in Account settings and disconnect social accounts at any
          time. You can also ask us to:
        </p>
        <ul>
          <li>Send you a copy of your data</li>
          <li>Correct something that's wrong</li>
          <li>Delete your account and data</li>
        </ul>
        <p>
          Email <a href={`mailto:${env.supportEmail}`}>{env.supportEmail}</a> and we'll reply within
          30 days.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        If we change how we handle your data, we'll update this page and let you know about anything
        important before it takes effect. The rules for using {app} are in our{" "}
        <Link to={paths.terms}>Terms & Conditions</Link>.
      </p>
    ),
  },
];

function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="September 17, 2026"
      intro={
        <p>
          This page explains what {app} collects, why, and what control you have over it. The short
          version: we use your data to run the product, and nothing else.
        </p>
      }
      sections={sections}
    />
  );
}

export default Privacy;
