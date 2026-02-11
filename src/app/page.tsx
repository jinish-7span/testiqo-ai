"use client";

import { useState } from "react";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  const [role, setRole] = useState<"admin" | "editor" | "candidate" | null>(null);

  if (!role) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-950 text-white">
        <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm flex flex-col gap-8">
          <h1 className="text-4xl font-bold mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            Welcome to TestiQo AI Agent
          </h1>
          <p className="text-slate-400 text-lg mb-4">Please select your role to continue:</p>
          <div className="flex gap-4">
            {(["admin", "editor", "candidate"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl capitalize transition-all hover:scale-105 active:scale-95"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-slate-950">
      <ChatInterface role={role} onBack={() => setRole(null)} />
    </main>
  );
}
