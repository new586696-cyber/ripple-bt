import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageCircleMore, ShieldCheck, Zap } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { APP_NAME } from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ripple — sign in and start messaging" },
      {
        name: "description",
        content:
          "Sign in to Ripple with Google to message friends and groups in real time with photos, voice notes and files.",
      },
      { property: "og:title", content: "Ripple — sign in and start messaging" },
      {
        property: "og:description",
        content: "Sign in to Ripple with Google to message friends and groups in real time with photos, voice notes and files.",
      },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) void navigate({ to: "/chats", replace: true });
  }, [session, navigate]);

  const signIn = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Sign-in didn't work", {
          description: "Please try again in a moment.",
        });
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      void navigate({ to: "/chats", replace: true });
    } catch {
      toast.error("Sign-in didn't work", { description: "Please try again in a moment." });
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-app-canvas px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-fab">
          <MessageCircleMore className="size-8" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">{APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Private, real-time messaging for the people who matter.
        </p>

        <Button
          className="mt-8 h-12 w-full rounded-2xl text-base"
          disabled={busy || loading}
          onClick={() => void signIn()}
        >
          <GoogleMark />
          {busy ? "Opening Google…" : "Sign in with Google"}
        </Button>

        <ul className="mt-8 space-y-3 text-left text-sm text-muted-foreground">
          <li className="flex items-center gap-3">
            <Zap className="size-4 text-primary" /> Instant delivery with live updates
          </li>
          <li className="flex items-center gap-3">
            <ShieldCheck className="size-4 text-primary" /> Only chat members can read a
            conversation
          </li>
        </ul>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.6 36.6 44 31 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
