import { cn } from "@/lib/utils";

interface AudioWaveformProps {
  values: number[];
  className?: string;
  barCount?: number;
  mirrored?: boolean;
}

/**
 * Renders a frequency-bar waveform from normalised 0-1 values.
 * Bars are symmetric when mirrored=true.
 */
export function AudioWaveform({ values, className, barCount = 24, mirrored = true }: AudioWaveformProps) {
  const display = values.length > 0
    ? values
    : Array.from({ length: barCount }, () => 0);

  const step = Math.max(1, Math.floor(display.length / barCount));
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const slice = display.slice(i * step, (i + 1) * step);
    const avg = slice.length > 0
      ? slice.reduce((a, b) => a + b, 0) / slice.length
      : 0;
    bars.push(avg);
  }

  return (
    <div
      className={cn("flex items-center justify-center gap-[2px] h-16", className)}
      aria-hidden="true"
    >
      {bars.map((value, idx) => {
        const heightPercent = Math.max(8, value * 100);
        const delay = mirrored
          ? `${Math.abs(idx - barCount / 2) * 30}ms`
          : `${idx * 20}ms`;
        return (
          <div
            key={idx}
            className="w-1.5 rounded-full bg-primary/80 transition-all duration-75 ease-out"
            style={{
              height: `${heightPercent}%`,
              minHeight: 4,
              animationDelay: delay,
            }}
          />
        );
      })}
    </div>
  );
}
