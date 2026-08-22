import NextAuth, { type DefaultSession } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { EmailConfig } from "@auth/core/providers";
import { prisma } from "@/lib/prisma";
import { sendEmail, layout } from "@/lib/email";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "PARENT" | "STAFF";
      familyId?: string | null;
    } & DefaultSession["user"];
  }
}

type SessionRole = "ADMIN" | "PARENT" | "STAFF";

// Custom "email" (magic-link) provider that sends via Gmail SMTP.
const emailProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email Magic Link",
  from: process.env.EMAIL_FROM || "noreply@example.com",
  maxAge: 24 * 60 * 60,
  async sendVerificationRequest({ identifier, url }) {
    await sendEmail({
      to: identifier,
      subject: "Sign in to Miss Loh Tutoring School",
      html: layout("Your sign-in link", `
        <p>Click below to sign in:</p>
        <p><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Sign in</a></p>
        <p>If you didn't request this, you can ignore this message. The link expires shortly.</p>
      `),
    });
  },
};

function isAllowedEmail(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAILS;
  if (!allowed) return true; // no allowlist = open
  return allowed.split(",").map((e) => e.trim().toLowerCase()).includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    emailProvider,
  ],
  callbacks: {
    signIn({ user, email }) {
      const addr = typeof email === "string" ? email : user?.email;
      if (!addr || !isAllowedEmail(addr)) return false;
      return true;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: string }).role as SessionRole;
        session.user.familyId = (user as { familyId?: string | null }).familyId ?? null;
      }
      return session;
    },
  },
});