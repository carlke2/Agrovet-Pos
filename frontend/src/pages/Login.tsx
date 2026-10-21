import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "@/services/toast";
import API from "@/services/api";
import Loader from "@/components/ui/loader";
import { landingPathFor, useAuth } from "@/context/AuthContext";
import type { AuthUser } from "@/services/authStorage";

const BRAND = "#334155";

const Login: React.FC = () => {
  const { status, user, login, refreshSession } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "authenticated" && user) {
      navigate(landingPathFor(user), { replace: true });
    }
  }, [status, user, navigate]);

  if (status === "loading") {
    return (
      <Loader size="sm" title="Loading Agrovet POS..." subtitle="Checking your session" className="min-h-screen py-24" />
    );
  }

  const toAuthUser = (data: any): AuthUser | null => {
    const source = data?.user?.id ? data.user : data;
    if (!source?.id || typeof source.role !== "string" || !Array.isArray(source.permissions)) return null;
    return {
      id: source.id,
      name: source.name,
      email: source.email,
      phone: source.phone,
      role: source.role,
      permissions: source.permissions,
      mustChangePassword: Boolean(source.mustChangePassword),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const rawId = identifier.trim();
      const rawPass = password;

      const res = await API.post("/auth/login", {
        identifier: rawId,
        password: rawPass.trim(),
      });
      const data = res.data;

      if (!data?.token || !data?.user?.role) {
        toast.error("Login failed", "Unexpected response from server");
        return;
      }

      const authUser = toAuthUser(data);
      if (!authUser) {
        toast.error("Login failed", "Unexpected response from server");
        return;
      }
      login(authUser, data.token);
      void refreshSession();
      toast.success(`Welcome, ${authUser.name || "user"}!`);
      navigate(landingPathFor(authUser));
    } catch (error: any) {
      toast.error("Login failed", error.response?.data?.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full px-3 py-3 bg-gray-100 border-2 border-transparent focus:border-[#334155]/30 focus:bg-white rounded-xl outline-none text-sm transition";

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 font-sans relative overflow-y-auto">
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-[#334155]/10 blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-[#334155]/5 blur-[120px]" />
      </div>

      <div className="min-h-screen flex items-center justify-center py-8">
        <div className="w-full max-w-[380px] relative my-auto">
          <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8 border border-gray-100">
            <div className="flex flex-col items-center mb-6">
              <h2 className="text-xl font-bold text-[#334155]">Agrovet POS</h2>
              <p className="text-slate-500 text-xs mt-1 text-center">
                Staff login with your email and password
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="Email address"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className={inputCls}
                />
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#334155]"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ backgroundColor: BRAND }}
                className="w-full py-3 text-sm font-bold rounded-xl text-white hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader size="xs" showText={false} />
                    Authenticating...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>

              <p className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-[#334155] hover:underline"
                >
                  Forgot password?
                </Link>
              </p>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-100 text-center">
              <p className="text-[10px] text-gray-400">
                © {new Date().getFullYear()} Agrovet POS
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
