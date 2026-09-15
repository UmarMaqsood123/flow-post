import {
  CalendarDays,
  Clock,
  Hash,
  Layers,
  type LucideIcon,
  PenLine,
  Plug,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

/** Landing page copy and data. Edit content here rather than in the components. */

export const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

export const platforms = [
  { name: "LinkedIn", color: "#0a66c2" },
  { name: "Instagram", color: "#e1306c" },
  { name: "Facebook", color: "#1877f2" },
  { name: "TikTok", color: "#111827" },
  { name: "YouTube", color: "#ff0000" },
] as const;

export type PlatformName = (typeof platforms)[number]["name"];

export const platformColor = (name: PlatformName) =>
  platforms.find((platform) => platform.name === name)?.color ?? "#64748b";

interface IconItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const features: IconItem[] = [
  {
    icon: Sparkles,
    title: "AI that writes like you",
    description:
      "Describe a topic and a tone. FlowPost drafts posts in your brand voice, ready for you to edit.",
  },
  {
    icon: Layers,
    title: "One idea, every platform",
    description:
      "Each draft is adapted to where it's going: polished for LinkedIn, visual for Instagram, snappy for TikTok.",
  },
  {
    icon: CalendarDays,
    title: "Visual content calendar",
    description:
      "See your week at a glance, spot gaps early and move posts to a better slot in seconds.",
  },
  {
    icon: Clock,
    title: "Scheduled publishing",
    description:
      "Queue posts once and they go out on time, with automatic retries if a platform is slow to respond.",
  },
  {
    icon: Hash,
    title: "Captions and hashtags",
    description:
      "Get caption and hashtag suggestions tailored to each network so your posts are easier to discover.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    description:
      "Modern password hashing, short-lived sessions and email verification keep your accounts protected.",
  },
];

export const steps: IconItem[] = [
  {
    icon: Plug,
    title: "Connect your accounts",
    description: "Link the social profiles you manage in a few clicks.",
  },
  {
    icon: PenLine,
    title: "Describe your post",
    description:
      "Share a topic, a link or a rough note and pick a tone. FlowPost drafts a version for each platform.",
  },
  {
    icon: Send,
    title: "Review and schedule",
    description: "Edit anything you like, choose a time, and FlowPost publishes it for you.",
  },
];

export const showcasePoints = [
  "Every scheduled post across all five platforms in one view",
  "Color-coded by network so gaps and clusters stand out",
  "Reschedule or edit a post without leaving the calendar",
];

export interface PricingPlan {
  name: string;
  /** Monthly price in USD. */
  price: number;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

// TODO(pricing): placeholder plans — align names, limits and prices with the Stripe products before launch.
export const pricingPlans: PricingPlan[] = [
  {
    name: "Starter",
    price: 0,
    description: "For individuals getting started with consistent posting.",
    features: [
      "3 connected social accounts",
      "30 AI-generated posts per month",
      "Content calendar",
      "Scheduled publishing",
    ],
    cta: "Start free",
  },
  {
    name: "Pro",
    price: 29,
    description: "For creators and small businesses posting every day.",
    features: [
      "10 connected social accounts",
      "500 AI-generated posts per month",
      "Brand voice settings",
      "Caption and hashtag suggestions",
      "Everything in Starter",
    ],
    cta: "Start with Pro",
    highlighted: true,
  },
  {
    name: "Business",
    price: 79,
    description: "For teams managing several brands at once.",
    features: [
      "25 connected social accounts",
      "2,000 AI-generated posts per month",
      "Multiple brands",
      "Priority support",
      "Everything in Pro",
    ],
    cta: "Start with Business",
  },
];

export const faqs = [
  {
    question: "Which social networks does FlowPost support?",
    answer:
      "FlowPost is built for LinkedIn, Instagram, Facebook, TikTok and YouTube, so you can plan and publish from one place.",
  },
  {
    question: "Will AI post anything without my approval?",
    answer:
      "No. FlowPost creates drafts. You review and edit every post, and nothing is published until you schedule it.",
  },
  {
    question: "How does FlowPost match my brand's voice?",
    answer:
      "You describe your tone and audience, and FlowPost uses that guidance every time it drafts a post. Your edits help you refine it over time.",
  },
  {
    question: "Can I change plans later?",
    answer: "Yes. You can move between plans as your needs change, straight from your account.",
  },
  {
    question: "How is my account kept secure?",
    answer:
      "Passwords are protected with modern hashing, sessions expire automatically, and you can sign out of every device at once from your dashboard.",
  },
];
