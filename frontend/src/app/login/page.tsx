"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, CheckCircle2, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";
import { ChaiLogo } from "@/components/layout/Sidebar";

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (isRegister) {
        const { authApi } = await import("@/lib/api");
        await authApi.register({ email, password, full_name: fullName, tenant_name: companyName });
        toast.success("Account created. Please sign in.");
        setIsRegister(false);
      } else {
        await login(email, password);
        router.push("/dashboards");
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Authentication failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0f1d] font-sans antialiased">
      {/* Background Animated Gradient Orbs */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-amber-500/20 to-rose-500/20 mix-blend-screen animate-pulse-glow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr from-violet-600/20 to-sky-600/20 mix-blend-screen animate-pulse-glow" style={{ animationDelay: "-3s" }} />
        <div className="absolute top-[30%] right-[20%] w-[350px] h-[350px] rounded-full bg-gradient-to-tr from-rose-600/10 to-violet-600/10 mix-blend-screen animate-float-slow" />
        <div className="absolute bottom-[20%] left-[10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-amber-500/10 to-sky-500/10 mix-blend-screen animate-float-medium" />
      </div>

      <div className="relative z-10 flex w-full max-w-6xl items-stretch justify-center p-4 md:p-8 lg:p-12">
        {/* Left Side: Product Showcase (Desktop Only) */}
        <div className="hidden w-1/2 flex-col justify-between rounded-l-3xl bg-gradient-to-br from-slate-900 via-indigo-950/80 to-slate-950 p-12 text-white border-l border-t border-b border-white/10 lg:flex shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.1),transparent_50%)]" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6 animate-slide-up-fade">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 backdrop-blur shadow-lg">
                <ChaiLogo className="w-7 h-7" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-amber-400 via-rose-400 to-violet-400 bg-clip-text text-transparent">
                Chai Analysis
              </span>
            </div>
            
            <h1 className="mb-4 text-4xl font-extrabold leading-tight tracking-tight animate-slide-up-fade animation-delay-100">
              Upload data.<br/>Ask questions.<br/>Build dashboards.
            </h1>
            <p className="mb-8 text-base text-slate-300 animate-slide-up-fade animation-delay-200 leading-relaxed">
              A premium, focused analytics workspace for CSV & Excel exploration, accurate calculations, and interactive dashboard creation.
            </p>
          </div>

          {/* Interactive Floating Mockup Dashboard */}
          <div className="relative z-10 my-auto w-full aspect-[4/3] max-w-[400px] mx-auto border border-white/10 rounded-2xl bg-slate-950/60 backdrop-blur p-4 shadow-3xl animate-float-slow">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-slate-400 font-mono ml-2">sales_report.csv</span>
              </div>
              <div className="w-16 h-3 rounded bg-white/10" />
            </div>
            
            {/* Mock Charts */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-slate-400 mb-1">Monthly Growth</div>
                <div className="text-lg font-bold text-amber-400">14.8%</div>
                <div className="flex items-end h-8 gap-1 mt-2">
                  <div className="flex-1 bg-gradient-to-t from-amber-500 to-rose-500 rounded-sm h-[30%]" />
                  <div className="flex-1 bg-gradient-to-t from-amber-500 to-rose-500 rounded-sm h-[50%]" />
                  <div className="flex-1 bg-gradient-to-t from-amber-500 to-rose-500 rounded-sm h-[80%]" />
                  <div className="flex-1 bg-gradient-to-t from-amber-500 to-rose-500 rounded-sm h-[100%]" />
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">Confidence Score</div>
                  <div className="text-lg font-bold text-violet-400">99.2%</div>
                </div>
                {/* SVG Radial Progress */}
                <svg className="w-8 h-8 self-end rotate-[-90deg]" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="16" fill="none" stroke="#1e293b" strokeWidth="3" />
                  <circle cx="18" cy="18" r="16" fill="none" stroke="url(#chaiGradient)" strokeWidth="3" strokeDasharray="100" strokeDashoffset="15" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Mock Chat Interaction */}
            <div className="bg-gradient-to-r from-violet-600/20 to-rose-600/10 rounded-xl p-3 border border-white/5 text-[11px] space-y-1.5">
              <div className="flex items-center gap-1.5 text-rose-300 font-medium">
                <span>💬 Prompt:</span>
                <span className="text-white">Calculate top customer segment sales.</span>
              </div>
              <div className="text-slate-300 leading-relaxed pl-3 border-l border-white/10">
                AI Agent analyzed table: Enterprise segment contributed <strong className="text-white">$84.5K</strong> (68% of total).
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-3.5 text-sm text-slate-400 animate-slide-up-fade animation-delay-400">
            {[
              "Accurate row counts and statistical summaries",
              "AI-assisted natural language data queries",
              "Interactive drag-and-drop dashboard widgets",
              "Multi-tenant dashboard isolation",
              "Production-ready Postgres + Redis caching layer",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0" />
                <span className="text-slate-300">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Authentication Card (Always light-themed with black text for maximum contrast) */}
        <div className="flex w-full flex-col justify-center rounded-3xl bg-white/80 border border-white/40 p-8 shadow-2xl backdrop-blur-xl lg:w-1/2 lg:rounded-l-none lg:p-12">
          <div className="w-full max-w-md mx-auto">
            {/* Logo for mobile only */}
            <div className="mb-8 flex items-center gap-3 lg:hidden animate-slide-up-fade">
              <div className="w-9 h-9 rounded-xl bg-slate-900/5 flex items-center justify-center border border-slate-950/10 backdrop-blur shadow-md">
                <ChaiLogo className="w-6 h-6" />
              </div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-amber-500 via-rose-500 to-violet-600 bg-clip-text text-transparent">
                Chai Analysis
              </span>
            </div>

            <div className="animate-slide-up-fade">
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 mb-2">
                {isRegister ? "Create workspace" : "Welcome back"}
              </h2>
              <p className="text-slate-600 text-sm mb-8 font-medium">
                {isRegister ? "Launch your collaborative analytics node" : "Access your dashboard workspace"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {isRegister && (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 animate-slide-up-fade animation-delay-100">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-800">Full Name</label>
                    <Input 
                      value={fullName} 
                      onChange={(event) => setFullName(event.target.value)} 
                      placeholder="Jane Smith" 
                      required 
                      className="h-11 bg-white/95 border-slate-300 text-slate-950 placeholder-slate-400 focus:ring-rose-500/50 focus:border-rose-500 transition-all rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-800">Workspace Name</label>
                    <Input 
                      value={companyName} 
                      onChange={(event) => setCompanyName(event.target.value)} 
                      placeholder="Analytics Team" 
                      required 
                      className="h-11 bg-white/95 border-slate-300 text-slate-950 placeholder-slate-400 focus:ring-rose-500/50 focus:border-rose-500 transition-all rounded-xl"
                    />
                  </div>
                </div>
              )}
              
              <div className="animate-slide-up-fade animation-delay-200">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-800">Email Address</label>
                <Input 
                  type="email" 
                  value={email} 
                  onChange={(event) => setEmail(event.target.value)} 
                  placeholder="jane@company.com" 
                  required 
                  className="h-11 bg-white/95 border-slate-300 text-slate-950 placeholder-slate-400 focus:ring-rose-500/50 focus:border-rose-500 transition-all rounded-xl"
                />
              </div>

              <div className="animate-slide-up-fade animation-delay-300">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-800">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    className="h-11 pr-11 bg-white/95 border-slate-300 text-slate-950 placeholder-slate-400 focus:ring-rose-500/50 focus:border-rose-500 transition-all rounded-xl"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-1"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 animate-slide-up-fade animation-delay-400">
                <Button 
                  type="submit" 
                  className="relative overflow-hidden w-full h-11 bg-gradient-to-r from-amber-500 via-rose-500 to-violet-600 hover:opacity-95 text-white font-bold transition-all transform hover:scale-[1.01] active:scale-[0.99] rounded-xl shadow-lg shadow-rose-900/20"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      {isRegister ? "Create Account" : "Sign In"}
                      <ChevronRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </div>
            </form>

            <div className="mt-8 text-center text-sm animate-slide-up-fade animation-delay-500">
              <span className="text-slate-600">
                {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
              </span>
              <button 
                className="font-bold text-rose-600 hover:text-rose-700 hover:underline transition-colors ml-1" 
                onClick={() => setIsRegister(!isRegister)}
              >
                {isRegister ? "Sign in" : "Sign up"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
