"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("accountant@aspida.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-secondary">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <div className="text-4xl font-bold text-primary">A</div>
          <h1 className="mt-3 font-display text-4xl text-white">Debt Accounting</h1>
          <p className="mt-2 text-sm text-white/70">
            Protecting dreams — tracking the debt that funds them.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 bg-white p-8">
          <div>
            <label className="text-nav text-body">Email</label>
            <input
              className="mt-1 w-full border border-border px-3 py-2 text-secondary outline-none focus:border-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </div>
          <div>
            <label className="text-nav text-body">Password</label>
            <input
              className="mt-1 w-full border border-border px-3 py-2 text-secondary outline-none focus:border-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </div>
          {error ? <p className="text-sm text-primary">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary py-3 text-nav text-white hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Log in"}
          </button>
          <p className="text-xs text-body">
            Demo: admin@aspida.local / accountant@aspida.local / viewer@aspida.local — password123
          </p>
        </form>
      </div>
    </div>
  );
}
