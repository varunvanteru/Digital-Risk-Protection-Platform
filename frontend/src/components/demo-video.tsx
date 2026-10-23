"use client";

import { PlayCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "./ui";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * The demo video at the top of How to use. It starts on its own (muted, which browsers require
 * for autoplay; the video has no sound track) and, when it ends, scrolls on to the written guide.
 * Playback speed buttons sit above it, since browsers hide speed in their own controls.
 */
export function DemoVideo({ guideId }: { guideId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    // Some browsers ignore the autoplay attribute after client-side navigation; start it explicitly.
    ref.current?.play().catch(() => {});
  }, []);

  const toGuide = () => document.getElementById(guideId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const pickSpeed = (s: number) => {
    setSpeed(s);
    if (ref.current) ref.current.playbackRate = s;
  };

  return (
    // Width capped so the whole video, controls included, fits on a laptop screen below the title.
    <Card id="demo-video" className="mb-4 max-w-[1040px] scroll-mt-20 overflow-hidden">
      <CardHeader
        icon={<PlayCircle />}
        title="Watch first: the 5-minute demo"
        description="The whole app in one flow, from sign-in to the takedown letter. The written guide follows below."
      />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2" role="group" aria-label="Playback speed">
        <span className="mr-1 text-[12px] text-ink-3">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            onClick={() => pickSpeed(s)}
            className={
              speed === s
                ? "rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-surface"
                : "rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:text-ink"
            }
          >
            {s === 1 ? "Normal" : `${s}×`}
          </button>
        ))}
      </div>
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
        onLoadedMetadata={(e) => (e.currentTarget.playbackRate = speed)}
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
