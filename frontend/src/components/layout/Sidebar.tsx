"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import {
  MessageSquare, Settings, LogOut,
  Database, Table2, BarChart2, TrendingUp, X,
} from "lucide-react";

export function ChaiLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={cn("select-none", className)}
      fill="none"
    >
      <defs>
        <linearGradient id="chaiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <filter id="logoGlow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#EC4899" floodOpacity="0.3" />
        </filter>
      </defs>
      {/* Outer spinning dotted orbit */}
      <circle cx="50" cy="50" r="45" stroke="url(#chaiGradient)" strokeWidth="1.5" strokeDasharray="6 3" className="opacity-40 origin-center animate-[spin_40s_linear_infinite]" />
      
      {/* Central Chai leaf symbol */}
      <path
        d="M50 20 C65 35 65 65 50 80 C35 65 35 35 50 20 Z"
        fill="url(#chaiGradient)"
        filter="url(#logoGlow)"
        className="transition-all duration-300 hover:scale-105"
      />
      {/* Data trend line and nodes */}
      <path
        d="M50 75 V25"
        stroke="#FFFFFF"
        strokeWidth="3.5"
        strokeLinecap="round"
        className="opacity-90"
      />
      <circle cx="50" cy="35" r="3.5" fill="#FFFFFF" />
      
      <path
        d="M50 45 L62 38"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-90"
      />
      <circle cx="62" cy="38" r="3.5" fill="#FFFFFF" />

      <path
        d="M50 55 L38 48"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-90"
      />
      <circle cx="38" cy="48" r="3.5" fill="#FFFFFF" />

      <path
        d="M50 65 L64 57"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-90"
      />
      <circle cx="64" cy="57" r="3.5" fill="#FFFFFF" />
    </svg>
  );
}

const navItems = [
  { href: "/dashboards", label: "My Dashboards", icon: BarChart2 },
  { href: "/predictive-ml", label: "Predictive ML", icon: TrendingUp },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/data-explorer", label: "Data Explorer", icon: Table2 },
  { href: "/datasets", label: "Datasets", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside 
      className={cn(
        "w-64 min-h-screen bg-sidebar text-sidebar-foreground flex flex-col fixed inset-y-0 left-0 z-50 transform -translate-x-full transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar-accent/30 flex items-center justify-center border border-sidebar-border shadow-inner">
            <ChaiLogo className="w-6 h-6" />
          </div>
          <span className="text-base font-bold leading-tight text-white">Chai Analysis</span>
        </div>

        {/* Close Button for mobile view */}
        <button 
          onClick={onClose} 
          className="md:hidden p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/75 hover:text-white"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-sidebar-accent text-white"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
            {user?.full_name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-xs text-sidebar-foreground/50 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
