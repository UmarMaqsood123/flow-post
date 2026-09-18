import { Link } from "react-router";
import LegalPage, { type LegalSection } from "@/components/landing/LegalPage";
import { env } from "@/config/env";
import { paths } from "@/routing/paths";

const app = env.appName;

const sections: LegalSection[] = [
  {
    id: "accounts",
    title: "Your account",
    body: (
      <>
        <p>
          You need an account to use {app}. Give us accurate details, keep your password to
          yourself, and let us know right away if you think someone else has got into your account.
          You're responsible for what happens under your login.
        </p>
        <p>
          You must be at least 16 years old, and old enough to agree to these terms where you live.
        </p>
      </>
    ),
  },
  {
    id: "workspaces",
    title: "Workspaces and teams",
    body: (
      <p>
        Accounts, brand profiles, posts and connected social accounts live inside workspaces. The
        workspace owner decides who joins and what role they have. If you invite people, you're
        responsible for making sure they follow these terms too.
      </p>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <p>
          You own what you put into {app}: briefs, brand details, images, videos and the posts you
          publish. We don't claim any of it.
        </p>
        <p>
          To run the service, you give us permission to store, process, resize and send that content
          where you tell us to, like generating drafts or publishing to a connected account. We only
          use it for that.
        </p>
        <p>
          Make sure you have the rights to anything you upload or publish, including photos, music
          and logos.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "AI-generated drafts",
    body: (
      <>
        <p>
          {app} uses AI to write drafts and suggest content strategy. AI gets things wrong
          sometimes. Drafts can include mistakes, out-of-date facts or wording that doesn't fit your
          brand.
        </p>
        <p>
          Read posts before they go out. If you turn on Autopilot or skip approval, you're still
          responsible for what gets published under your name.
        </p>
      </>
    ),
  },
  {
    id: "social",
    title: "Connected social accounts",
    body: (
      <>
        <p>
          When you connect LinkedIn, Facebook, Instagram, TikTok or YouTube, you let {app} act on
          that account within the permissions you approve. You still have to follow each platform's
          own rules.
        </p>
        <p>
          Those platforms control their APIs. They can change features, limit what apps can do or
          reject a post, and that's outside our control. You can disconnect an account at any time
          from Social accounts.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "What you can't do",
    body: (
      <>
        <p>Don't use {app} to:</p>
        <ul>
          <li>Post spam, scams or misleading content</li>
          <li>Harass people or publish hateful, violent or sexual content involving minors</li>
          <li>Break the law or infringe someone else's rights</li>
          <li>Break into, overload or reverse engineer the service</li>
          <li>Resell access or share one paid plan across unrelated businesses</li>
        </ul>
        <p>If you do, we may remove content or suspend the account.</p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Plans and billing",
    body: (
      <>
        <p>
          Paid plans renew automatically each billing period until you cancel. Payments are handled
          by Stripe, and we never see or store your full card number.
        </p>
        <p>
          You can cancel from the Billing page. Your plan stays active until the end of the period
          you've paid for, and then the workspace moves to the free plan. If we change prices, we'll
          tell you before the change affects your next bill.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Closing your account",
    body: (
      <p>
        You can stop using {app} whenever you like. To delete your account and its data, email us.
        We can suspend or close accounts that break these terms or put other people or the service
        at risk. Where it's reasonable, we'll tell you first and explain why.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Service availability",
    body: (
      <p>
        We work hard to keep {app} running and your posts on time, but we can't promise the service
        will never go down or that every post will publish. It's provided "as is". We aren't liable
        for lost profits, lost data or indirect damages. If we are found liable for something, our
        total liability is limited to what you paid us in the 12 months before the claim.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We'll update these terms as the product changes. If a change matters, we'll let you know by
        email or in the app before it takes effect. Using {app} after that means you accept the new
        terms. How we handle personal data is covered in our{" "}
        <Link to={paths.privacy}>Privacy Policy</Link>.
      </p>
    ),
  },
];

function Terms() {
  return (
    <LegalPage
      title="Terms & Conditions"
      updated="September 17, 2026"
      intro={
        <p>
          These terms cover your use of {app}. They're written to be read, not skimmed past. By
          creating an account, you agree to them.
        </p>
      }
      sections={sections}
    />
  );
}

export default Terms;
