import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isProtected =
        path.startsWith("/dashboard") ||
        path.startsWith("/setup") ||
        path.startsWith("/plan") ||
        path.startsWith("/guide") ||
        path.startsWith("/reference-rates") ||
        path.startsWith("/monthly") ||
        path.startsWith("/instruments") ||
        path.startsWith("/journals") ||
        path.startsWith("/gl-mapping") ||
        path.startsWith("/reports") ||
        path.startsWith("/covenants") ||
        path.startsWith("/documents") ||
        path.startsWith("/admin");
      if (isProtected && !auth) return false;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        // role attached in full auth authorize
        token.role = (user as { role?: string }).role as never;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as never;
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
