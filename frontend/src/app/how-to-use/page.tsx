import { ArrowDown, Network } from "lucide-react";
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
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <a href="#architecture" className={buttonClass("secondary", "md")}>
              <Network />
              Architecture
              <ArrowDown />
            </a>
            <a href="#guide" className="inline-flex items-center gap-1 px-1 text-[12px] font-medium text-ink-2 hover:text-ink hover:underline">
              Skip to the written guide
              <ArrowDown className="size-3.5" />
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
