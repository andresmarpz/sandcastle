import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

/**
 * A 3x3 pixel grid spinner with rotating animation.
 * 3-4 squares are active at a time, rotating around the outer ring
 * with a gradient trail (head at 100%, fading to 0%).
 */

const renderToAnimation = [0, 1, 2, 7, undefined, 3, 6, 5, 4] as const;

function calculatePixelDistance(
  headIdx: number,
  pixelIdx: number,
  size: number = 8
) {
  return (headIdx - pixelIdx + size) % size;
}

function isPixelActive(
  headIdx: number,
  pixelIdx: number | undefined,
  size: number = 8,
  tailLength: number = 4
) {
  if (pixelIdx === undefined) return false;
  const distance = calculatePixelDistance(headIdx, pixelIdx, size);

  return distance < tailLength;
}

function calculatePixelOpacity(
  headIdx: number,
  pixelIdx: number | undefined,
  size: number = 8,
  tailLength: number = 4
) {
  const nonActiveOpacity = 5;
  if (pixelIdx === undefined) return nonActiveOpacity;

  const distance = calculatePixelDistance(headIdx, pixelIdx, size);
  const step = 100 / tailLength;
  return distance < tailLength ? 100 - distance * step : nonActiveOpacity;
}

export function PixelSpinner({ className }: { className?: string }) {
  const pixels = 8;
  const [headIndex, setHeadIndex] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setHeadIndex((prev) => {
        let n = ++prev;
        if (n >= pixels) n = 0;

        return n;
      });
    }, 80);

    return () => clearInterval(intervalRef.current!);
  }, []);

  // Outer ring positions (clockwise from top-left):
  // [0][1][2]
  // [7]   [3]
  // [6][5][4]

  return (
    <div className="pixel-spinner">
      <div className="grid grid-cols-3 gap-px">
        {Array.from({ length: 9 }, (_val, idx) => (
          <span
            key={`pixel_${idx}`}
            className={cn(idx === 4 ? "pixel-center" : "pixel")}
            style={{
              opacity:
                calculatePixelOpacity(headIndex, renderToAnimation[idx]) / 100,
              backgroundColor: isPixelActive(headIndex, renderToAnimation[idx])
                ? "var(--active-color)"
                : "var(--inactive-color)",
            }}
          ></span>
        ))}
      </div>

      <style>{`
        .pixel-spinner {
          --pixel-size: 4px;
          --active-color: var(--color-primary);
          --inactive-color: var(--color-foreground);
          --animation-duration: 0.8s;
          aspect-ratio: 1/1;
          width: calc(var(--pixel-size) * 3 + 3px);
        }

        .pixel-spinner .pixel,
        .pixel-spinner .pixel-center {
          width: var(--pixel-size);
          height: var(--pixel-size);
          border-radius: 0.5px;
          background-color: var(--inactive-color);
        }

        .pixel-spinner .pixel-center {
          background-color: transparent;
        }
      `}</style>
    </div>
  );
}
