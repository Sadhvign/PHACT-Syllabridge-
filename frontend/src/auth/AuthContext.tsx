import {
  confirmSignIn,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../lib/api";
import type { Profile } from "../lib/types";

type SignInResult = "DONE" | "NEW_PASSWORD_REQUIRED";

type AuthState = {
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string, universityId: string) => Promise<SignInResult>;
  completeNewPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [expectedUniversity, setExpectedUniversity] = useState("");

  const loadProfile = useCallback(async (universityId?: string) => {
    let loaded: Profile;
    try {
      loaded = await api<Profile>("/api/me");
    } catch (error) {
      await amplifySignOut();
      throw error;
    }
    if (universityId && loaded.university.id !== universityId) {
      await amplifySignOut();
      throw new Error(
        `This account belongs to ${loaded.university.name}. Select that university to sign in.`,
      );
    }
    setProfile(loaded);
  }, []);

  useEffect(() => {
    getCurrentUser()
      .then(() => loadProfile())
      .catch(() => setProfile(null))
      .finally(() => setIsLoading(false));
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string, universityId: string): Promise<SignInResult> => {
      const { nextStep } = await amplifySignIn({ username: email, password });
      setExpectedUniversity(universityId);
      if (nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
        return "NEW_PASSWORD_REQUIRED";
      }
      if (nextStep.signInStep !== "DONE") {
        throw new Error("This account needs additional setup. Contact ASPPH support.");
      }
      await loadProfile(universityId);
      return "DONE";
    },
    [loadProfile],
  );

  const completeNewPassword = useCallback(
    async (password: string) => {
      const { nextStep } = await confirmSignIn({ challengeResponse: password });
      if (nextStep.signInStep !== "DONE") {
        throw new Error("This account needs additional setup. Contact ASPPH support.");
      }
      await loadProfile(expectedUniversity);
    },
    [loadProfile, expectedUniversity],
  );

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ profile, isLoading, signIn, completeNewPassword, signOut }),
    [profile, isLoading, signIn, completeNewPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
