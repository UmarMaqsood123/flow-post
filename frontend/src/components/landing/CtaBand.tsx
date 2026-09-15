import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { buttonStyles } from "@/components/ui/buttonStyles";
import { paths } from "@/routing/paths";
import useSession from "@/services/auth/useSession";
import Container from "./Container";

function CtaBand() {
  const { data: user } = useSession();

  return (
    <section aria-labelledby="cta-heading" className="pb-20 sm:pb-28">
      <Container>
        <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-24 -z-10 size-80 rounded-full bg-violet-400/40 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-32 -left-20 -z-10 size-80 rounded-full bg-indigo-900/40 blur-3xl"
          />

          <h2
            id="cta-heading"
            className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl"
          >
            Take the busywork out of social media
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-pretty text-indigo-100">
            Create your account in under a minute and plan your first week of posts today.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to={user ? paths.dashboard : paths.signup}
              className={buttonStyles(
                "secondary",
                "border-transparent bg-white px-6 py-3 text-base text-primary hover:bg-indigo-50",
              )}
            >
              {user ? "Go to dashboard" : "Start free"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            {!user && (
              <Link
                to={paths.login}
                className={buttonStyles(
                  "secondary",
                  "border-white/30 bg-transparent px-6 py-3 text-base text-white hover:bg-white/10",
                )}
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

export default CtaBand;
