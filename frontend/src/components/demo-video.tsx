"use client";

import { PlayCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "./ui";

/**
 * The demo video at the top of How to use. It starts on its own (muted, which browsers require
 * for autoplay; the video has no sound track) and, when it ends, scrolls on to the written guide.
 */
export function DemoVideo({ guideId }: { guideId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    // Some browsers ignore the autoplay attribute after client-side navigation; start it explicitly.
    ref.current?.play().catch(() => {});
  }, []);

  const toGuide = () => document.getElementById(guideId)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    // Width capped so the whole video, controls included, fits on a laptop screen below the title.
    <Card id="demo-video" className="mb-4 max-w-[1040px] scroll-mt-20 overflow-hidden">
      <CardHeader
        icon={<PlayCircle />}
        title="Watch first: the 6-minute demo"
        description="Every feature, in the order of the challenge brief. The written guide follows below."
      />
      <video
        ref={ref}
        src="/help/impostr-demo.mp4"
        poster="/help/impostr-demo-poster.webp"
        autoPlay
        muted
        playsInline
        controls
        preload="auto"
        onEnded={() => {
          setEnded(true);
          toGuide();
        }}
        onPlay={() => setEnded(false)}
        className="block aspect-video w-full bg-black"
      >
        Your browser cannot play this video.
      </video>
      {ended && (
        <p className="border-t border-line px-4 py-2 text-[12.5px] text-ink-2" role="status">
          That was the demo. The written guide below explains every tab in detail.
        </p>
      )}
    </Card>
  );
}
