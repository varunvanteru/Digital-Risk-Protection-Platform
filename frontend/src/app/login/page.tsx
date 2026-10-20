import type { Metadata } from "next";
import { Oxanium } from "next/font/google";
import { ProjectSummary } from "@/components/project-summary";
import { Landing } from "./landing";
import "./login.css";

const oxanium = Oxanium({ variable: "--font-oxanium", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to IMPOSTR, create a free account, or continue in a demo workspace. IMPOSTR finds fake profiles, fake brand pages, scam accounts and look-alike apps impersonating a brand.",
};

export default function LoginPage() {
  return (
    <>
      <Landing className={oxanium.variable} />
      <ProjectSummary />
    </>
  );
}
