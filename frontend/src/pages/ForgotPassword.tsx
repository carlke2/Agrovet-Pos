import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";

type Step = "email" | "code" | "password" | "done";

const inputCls =
  "w-full px-3 py-3 bg-gray-100 border-2 border-transparent focus:border-primary-700/30 focus:bg-surface rounded-control outline-none text-sm transition";

function maskEmail(email: string): string {
  const [local, domain] = email.trim().split("@");
  if (!local || !domain) return email;
  if (local.length <= 4) {
    const stars = "*".repeat(Math.max(local.length - 1, 1));
    return `${local[0] ?? ""}${stars}@${domain}`;
  }
  const hidden = "*".repeat(local.length - 4);
  return `${local.slice(0, 2)}${hidden}${local.slice(-2)}@${domain}`;
}

const ForgotPassword = () => {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      await API.post("/auth/forgot-password/request", { email: email.trim() });
      toast.success("Check your email", "We sent a 6-digit code if an account exists");
      setStep("code");
    } catch (err: any) {
      toast.error("Could not send code", err.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (digits: string) => {
    if (verifyingRef.current || digits.length !== 6) return;

    verifyingRef.current = true;
    setVerifying(true);
    try {
      await API.post("/auth/forgot-password/verify", {
        email: email.trim(),
        code: digits,
      });
      toast.success("Code verified", "Choose your new password");
      setStep("password");
    } catch (err: any) {
      toast.error("Invalid code", err.response?.data?.message);
      setCode("");
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  const handleCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) {
      void verifyCode(digits);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 7) {
      return toast.error("Validation", "Password must be at least 7 characters");
    }
    if (newPassword !== confirmPassword) {
      return toast.error("Validation", "Passwords do not match");
    }

    setLoading(true);
    try {
      await API.post("/auth/forgot-password/reset", {
        email: email.trim(),
        code: code.trim(),
        newPassword,
        confirmPassword,
      });
      setStep("done");
      toast.success("Password updated", "You can log in with your new password");
    } catch (err: any) {
      toast.error("Reset failed", err.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 font-sans flex items-center justify-center">
      <div className="w-full max-w-[400px] bg-surface rounded-3xl shadow-xl p-6 md:p-8 border border-sand">
        <div className="flex flex-col items-center mb-6 text-center">
          <h1 className="text-xl font-bold text-ink mb-3">Agrovet POS</h1>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <KeyRound size={20} /> Forgot Password
          </h1>
          <p className="text-xs text-muted mt-1">
            {step === "email" && "We'll email you a 6-digit code (expires in 5 minutes)"}
            {step === "code" && "Enter the code we sent to your email"}
            {step === "password" && "Choose a new password"}
            {step === "done" && "Your password has been reset"}
          </p>
        </div>

        {step === "email" && (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-ink ml-1 mb-1 block">Staff email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`${inputCls} pl-9`}
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {loading ? "Sending..." : "Send reset code"}
            </Button>
          </form>
        )}

        {step === "code" && (
          <div className="space-y-4">
            <p className="text-xs text-muted text-center">
              Code sent to <strong>{maskEmail(email)}</strong>
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              disabled={verifying}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="6-digit code"
              className={`${inputCls} text-center text-2xl tracking-[0.4em] font-bold disabled:opacity-60`}
            />
            {verifying && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted">
                <Spinner inline size="sm" label="Verifying code" />
                Verifying code...
              </div>
            )}
            <button
              type="button"
              disabled={loading || verifying}
              onClick={() => {
                verifyingRef.current = false;
                setVerifying(false);
                setCode("");
                void requestCode();
              }}
              className="w-full text-xs text-muted hover:text-ink disabled:opacity-50"
            >
              {loading ? "Sending..." : "Resend code"}
            </button>
          </div>
        )}

        {step === "password" && (
          <form onSubmit={resetPassword} className="space-y-4">
            <input
              type="password"
              required
              minLength={7}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className={inputCls}
              autoComplete="new-password"
            />
            <input
              type="password"
              required
              minLength={7}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className={inputCls}
              autoComplete="new-password"
            />
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              <ShieldCheck size={16} />
              {loading ? "Saving..." : "Reset password"}
            </Button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted">You can now sign in with your new password.</p>
            <Button type="button" size="lg" className="w-full" onClick={() => navigate("/login")}>
              Go to login
            </Button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-sand text-center">
          <Link to="/login" className="text-xs text-ink font-semibold inline-flex items-center gap-1 hover:underline">
            <ArrowLeft size={14} /> Back to login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
