import { confirmResetPassword, resetPassword } from "aws-amplify/auth";
import { motion } from "framer-motion";
import { BookOpenCheck, Network, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { publicApi } from "../lib/api";
import type { University } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type View = "signIn" | "newPassword" | "forgot" | "reset" | "requestAccess";

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotAuthorizedException") return "Incorrect email or password.";
    if (error.name === "UserNotFoundException") return "Incorrect email or password.";
    if (error.name === "InvalidPasswordException") return error.message;
    if (error.name === "CodeMismatchException") return "That verification code is incorrect.";
    if (error.name === "LimitExceededException") {
      return "Too many attempts. Please wait a few minutes and try again.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const { profile, signIn, completeNewPassword } = useAuth();
  const location = useLocation();
  const [view, setView] = useState<View>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [universities, setUniversities] = useState<University[]>([]);
  const [universityId, setUniversityId] = useState("");

  useEffect(() => {
    publicApi<University[]>("/api/universities")
      .then(setUniversities)
      .catch(() => setError("Couldn't load the university list. Refresh to try again."));
  }, []);

  const from = (location.state as { from?: string } | null)?.from;
  if (profile) return <Navigate to={from && from !== "/login" ? from : "/"} replace />;

  const university = universities.find((u) => u.id === universityId);

  async function run(action: () => Promise<void>) {
    setError("");
    setIsBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  function go(next: View) {
    setError("");
    setNotice("");
    setPassword("");
    setView(next);
  }

  const handleSignIn = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!university) throw new Error("Select your university.");
      const address = email.trim().toLowerCase();
      if (!address.endsWith(`@${university.domain}`)) {
        throw new Error(`Sign in to ${university.name} with your @${university.domain} email.`);
      }
      const result = await signIn(address, password, university.id);
      if (result === "NEW_PASSWORD_REQUIRED") {
        setPassword("");
        setNotice("Choose a new password to finish setting up your account.");
        setView("newPassword");
      }
    });
  };

  const handleNewPassword = (event: FormEvent) => {
    event.preventDefault();
    void run(() => completeNewPassword(password));
  };

  const handleForgot = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await resetPassword({ username: email.trim() });
      setNotice("If an account exists for that email, we sent a verification code.");
      setView("reset");
    });
  };

  const handleReset = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await confirmResetPassword({
        username: email.trim(),
        confirmationCode: code.trim(),
        newPassword: password,
      });
      setPassword("");
      setCode("");
      setNotice("Your password was reset. Sign in with your new password.");
      setView("signIn");
    });
  };

  return (
    <main className="login product-login">
      <div className="product-login-aurora" aria-hidden="true" />
      <section className="login-hero" aria-label="About PHACT">
        <motion.div
          className="login-hero-inner"
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow">Association of Schools &amp; Programs of Public Health</p>
          <h1>Prepare public health graduates for an AI-enabled workforce.</h1>
          <ul className="login-points">
            {[
              { icon: BookOpenCheck, text: "Recommendations grounded in cited ASPPH sources" },
              { icon: Network, text: "Course objectives mapped to CEPH competencies" },
              { icon: ShieldCheck, text: "Privacy safeguards and faculty approval at every step" },
            ].map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
              >
                <Icon aria-hidden="true" />
                <span>{text}</span>
              </motion.li>
            ))}
          </ul>
          <Link to="/welcome" className="login-back-link">
            ← Back to PHACTcheck
          </Link>
        </motion.div>
      </section>

      <section className="login-panel">
        <motion.div
          className="login-card product-login-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="login-brand">
            <span className="brand-mark" aria-hidden="true">
              P
            </span>
            <div>
              <strong>PHACTcheck</strong>
              <span>Public Health AI Curriculum Transformation</span>
            </div>
          </div>

          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {view === "signIn" && (
            <form onSubmit={handleSignIn} className="form-stack">
              <h2>Sign in</h2>
              <div className="grid gap-2">
                <Label htmlFor="university">University</Label>
                <select
                  id="university"
                  value={universityId}
                  onChange={(e) => setUniversityId(e.target.value)}
                  required
                  className="product-select"
                >
                  <option value="" disabled>
                    Select your university
                  </option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder={university ? `name@${university.domain}` : "name@university.edu"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button className="w-full" disabled={isBusy}>
                {isBusy ? "Signing in…" : "Sign in"}
              </Button>
              <div className="login-links">
                <button type="button" className="link" onClick={() => go("forgot")}>
                  Forgot password?
                </button>
                <button type="button" className="link" onClick={() => go("requestAccess")}>
                  Request access
                </button>
              </div>
            </form>
          )}

          {view === "newPassword" && (
            <form onSubmit={handleNewPassword} className="form-stack">
              <h2>Set a new password</h2>
              <div className="grid gap-2">
                <Label htmlFor="set-password">New password</Label>
                <Input
                  id="set-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  required
                />
              </div>
              <p className="hint">
                At least 12 characters with upper- and lowercase letters, a number, and a symbol.
              </p>
              <Button className="w-full" disabled={isBusy}>
                {isBusy ? "Saving…" : "Save and continue"}
              </Button>
            </form>
          )}

          {view === "forgot" && (
            <form onSubmit={handleForgot} className="form-stack">
              <h2>Reset your password</h2>
              <div className="grid gap-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button className="w-full" disabled={isBusy}>
                {isBusy ? "Sending…" : "Send verification code"}
              </Button>
              <button type="button" className="link" onClick={() => go("signIn")}>
                Back to sign in
              </button>
            </form>
          )}

          {view === "reset" && (
            <form onSubmit={handleReset} className="form-stack">
              <h2>Enter your code</h2>
              <div className="grid gap-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  required
                />
              </div>
              <Button className="w-full" disabled={isBusy}>
                {isBusy ? "Resetting…" : "Reset password"}
              </Button>
              <button type="button" className="link" onClick={() => go("signIn")}>
                Back to sign in
              </button>
            </form>
          )}

          {view === "requestAccess" && (
            <div className="form-stack">
              <h2>Request access</h2>
              <p className="body-copy">
                PHACT accounts are provisioned by ASPPH for faculty at member schools and programs.
                Ask your program&apos;s ASPPH contact to request an account for your institutional
                email address.
              </p>
              <Button type="button" variant="secondary" className="w-full" onClick={() => go("signIn")}>
                Back to sign in
              </Button>
            </div>
          )}

          <p className="login-footer">© ASPPH Member Portal</p>
        </motion.div>
      </section>
    </main>
  );
}
