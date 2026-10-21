import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";

import { supabase } from "../lib/supabase.ts";
import {
  ACTIVITY_EVENTS,
  IDLE_LOGOUT_MS,
  IDLE_TICK_MS,
  IDLE_WARN_MS,
} from "../lib/idle.ts";
import { AuthContext, type Profile } from "./auth-context.ts";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [idling, setIdling] = useState(false);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Initial session + auth state listener.
  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Keep this callback light: state only, no awaits (Supabase contract).
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRecovering(false);
        setIdling(false);
      } else if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id ?? null;

  // Profile row mirrors signup metadata via the database trigger.
  useEffect(() => {
    if (userId == null) return;

    let current = userId;
    void supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (current !== userId) return; // user changed before the row arrived
        setProfile((data as Profile) ?? null);
      });
  }, [userId]);

  // Idle auto sign-out: warns at IDLE_WARN_MS, signs out at IDLE_LOGOUT_MS.
  const lastActiveRef = useRef(0);
  const idleWarnedRef = useRef(false);
  const idleSignedOutRef = useRef(false);

  useEffect(() => {
    if (session == null) return;
    lastActiveRef.current = Date.now();
    idleSignedOutRef.current = false;
    idleWarnedRef.current = false;

    const touch = () => {
      // Assignment is trivial for all of these event rates.
      lastActiveRef.current = Date.now();
      if (idleWarnedRef.current) {
        idleWarnedRef.current = false;
        setIdling(false);
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, touch, false);
    }

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - lastActiveRef.current;

      if (idleFor >= IDLE_LOGOUT_MS) {
        if (idleSignedOutRef.current) return;
        idleSignedOutRef.current = true;
        void supabase.auth.signOut();
        navigate("/signin?idle=1", { replace: true });
        return;
      }

      if (idleFor >= IDLE_WARN_MS) {
        if (!idleWarnedRef.current) {
          idleWarnedRef.current = true;
          setIdling(true);
        }
      }
    }, IDLE_TICK_MS);

    return () => {
      window.clearInterval(interval);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, touch, false);
      }
    };
  }, [session, navigate]);

  const clearRecovery = useCallback(() => setRecovering(false), []);
  const clearIdle = useCallback(() => setIdling(false), []);

  const value = useMemo(
    () => ({
      user,
      session,
      profile,
      loading,
      recovering,
      idling,
      signOut,
      clearRecovery,
      clearIdle,
    }),
    [user, session, profile, loading, recovering, idling, signOut, clearRecovery, clearIdle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
