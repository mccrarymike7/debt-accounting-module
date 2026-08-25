import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/setup/:path*",
    "/plan/:path*",
    "/guide/:path*",
    "/reference-rates/:path*",
    "/monthly/:path*",
    "/instruments/:path*",
    "/journals/:path*",
    "/gl-mapping/:path*",
    "/reports/:path*",
    "/covenants/:path*",
    "/documents/:path*",
    "/admin/:path*",
  ],
};
