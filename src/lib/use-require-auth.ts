import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

/** Client-side gate: bounces signed-out visitors back to the sign-in screen. */
export function useRequireAuth() {
  const { session, loading, userId, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  return { userId, profile, ready: !loading && !!session };
}
