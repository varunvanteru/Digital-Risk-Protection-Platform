import { ArrowDown, BookOpen, Network } from "lucide-react";
import type { Metadata } from "next";
import { Architecture } from "@/components/architecture";
import { DemoVideo } from "@/components/demo-video";
import { GuideSlides } from "@/components/guide-slides";
import { PageHeader, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "How to use" };

export default function HowToUsePage() {
  return (
    <>
      <PageHeader
        eyebrow="Guide"
        title="How to use"
        description="Start with the demo video, then step through the guide: every tab and feature of IMPOSTR, with screenshots of the real app."
        actions={
          <div className="flex flex-col items-start gap-2 sm:items-stretch">
            <a href="#architecture" className={buttonClass("secondary", "md")}>
              <Network />
              Architecture
              <ArrowDown />
            </a>
            <a href="#guide" className={buttonClass("secondary", "md")}>
              <BookOpen />
              Skip to the written guide
              <ArrowDown />
            </a>
          </div>
        }
      />

      <DemoVideo guideId="guide" />

      {/* Where the guide starts; the video scrolls here when it ends. */}
      <div id="guide" className="scroll-mt-20" />

      <GuideSlides />

      <Architecture />
    </>
  );
}
