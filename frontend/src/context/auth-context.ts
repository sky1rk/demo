import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  role: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** True until the initial local-session lookup resolves. */
  loading: boolean;
  /** True while a password-recovery link redirect is being processed. */
  recovering: boolean;
  /** True when the countdown banner before idle sign-out should show. */
  idling: boolean;
  signOut: () => Promise<void>;
  clearRecovery: () => void;
  clearIdle: () => void;
}

/** Shared auth store; consumed through `useAuth` and populated by AuthProvider. */
export const AuthContext = createContext<AuthContextValue | null>(null);
