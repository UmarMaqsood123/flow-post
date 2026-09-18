import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Clock, Mail } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Link } from "react-router";
import Container from "@/components/landing/Container";
import PageIntro from "@/components/landing/PageIntro";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import TextAreaField from "@/components/ui/TextAreaField";
import TextField from "@/components/ui/TextField";
import { CONTACT_MESSAGE_MAX_LENGTH, CONTACT_TOPIC_OPTIONS } from "@/config/contact";
import { env } from "@/config/env";
import { applyServerFieldErrors, getErrorMessage } from "@/lib/forms";
import { paths } from "@/routing/paths";
import { type ContactFormValues, contactSchema } from "@/schemas/contact.schema";
import useSession from "@/services/auth/useSession";
import useSendContactMessage from "@/services/contact/useSendContactMessage";
import type { ContactTopic } from "@/types/contact";

const FIELDS = ["name", "email", "topic", "message"] as const;

function ContactForm() {
  const { data: user } = useSession();
  const send = useSendContactMessage();
  const {
    control,
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    values: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      topic: "SUPPORT",
      message: "",
      website: "",
    },
    resetOptions: { keepDirtyValues: true },
  });
  const messageLength = useWatch({ control, name: "message" }).length;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await send.mutateAsync({ ...values, topic: values.topic as ContactTopic });
    } catch (error) {
      applyServerFieldErrors(error, setError, FIELDS);
    }
  });

  if (send.isSuccess) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-line p-8 text-center sm:p-12">
        <CheckCircle2 className="size-10 text-green-600" aria-hidden="true" />
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">Message sent</h2>
        <p className="mt-2 max-w-md text-muted">
          Thanks for writing in. We&apos;ll reply to the email you gave us as soon as we can.
        </p>
        <button
          type="button"
          onClick={() => {
            send.reset();
            reset();
          }}
          className="mt-6 cursor-pointer text-sm font-medium text-primary hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  const fieldErrorShown = FIELDS.some((field) => errors[field]);

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="relative flex flex-col gap-5 rounded-2xl border border-line p-6 sm:p-8"
    >
      {send.isError && !fieldErrorShown && (
        <Alert variant="error">{getErrorMessage(send.error)}</Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register("name")}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          hint="We'll reply here."
          error={errors.email?.message}
          {...register("email")}
        />
      </div>

      <Controller
        control={control}
        name="topic"
        render={({ field }) => (
          <ChoiceGroup<ContactTopic>
            layout="chips"
            label="What's it about?"
            options={CONTACT_TOPIC_OPTIONS}
            value={field.value as ContactTopic}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={errors.topic?.message}
          />
        )}
      />

      <TextAreaField
        label="Message"
        rows={6}
        maxLength={CONTACT_MESSAGE_MAX_LENGTH}
        placeholder="Tell us what's going on. If something isn't working, the steps you took help a lot."
        hint={`${messageLength} / ${CONTACT_MESSAGE_MAX_LENGTH}`}
        error={errors.message?.message}
        {...register("message")}
      />

      {/* Honeypot: hidden from people and screen readers, so only bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          By sending this, you agree to our{" "}
          <Link to={paths.privacy} className="text-primary hover:underline">
            Privacy Policy
          </Link>
          . Never include your password.
        </p>
        <Button type="submit" isLoading={send.isPending} className="shrink-0">
          Send message
        </Button>
      </div>
    </form>
  );
}

function Contact() {
  return (
    <>
      <PageIntro eyebrow="Contact" title="Get in touch">
        <p>
          Have a question, hit a problem or want to share an idea? Send us a message. A real person
          reads every one.
        </p>
      </PageIntro>

      <Container className="grid max-w-5xl gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_18rem]">
        <ContactForm />

        <aside className="flex flex-col gap-6 text-sm">
          <div className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">When we reply</h2>
              <p className="mt-1 leading-relaxed text-muted">
                We answer every message by email, as soon as we can.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Mail className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Prefer email?</h2>
              <a
                href={`mailto:${env.supportEmail}`}
                className="mt-1 block break-all text-primary hover:underline"
              >
                {env.supportEmail}
              </a>
            </div>
          </div>
          <p className="border-t border-line pt-6 leading-relaxed text-muted">
            Looking for a quick answer? The{" "}
            <a href="/#faq" className="text-primary hover:underline">
              FAQ
            </a>{" "}
            covers the most common questions.
          </p>
        </aside>
      </Container>
    </>
  );
}

export default Contact;
