import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import "./pixel-spinner.css";

/**
 * A 3x3 pixel grid spinner with rotating animation.
 * 3-4 squares are active at a time, rotating around the outer ring
 * with a gradient trail (head at 100%, fading to 0%).
 *
 * Outer ring positions (clockwise from top-left):
 * [0][1][2]
 * [7]   [3]
 * [6][5][4]
 */

const RING_SIZE = 8;
const TAIL_LENGTH = 4;
const INTERVAL_MS = 80;
const NON_ACTIVE_OPACITY = 5;

/** Maps render index (0-8 grid order) to animation index (clockwise ring order) */
const renderToAnimation = [0, 1, 2, 7, undefined, 3, 6, 5, 4] as const;

function calculatePixelDistance(headIdx: number, pixelIdx: number): number {
  return (headIdx - pixelIdx + RING_SIZE) % RING_SIZE;
}

function isPixelActive(headIdx: number, pixelIdx: number | undefined): boolean {
  if (pixelIdx === undefined) return false;
  return calculatePixelDistance(headIdx, pixelIdx) < TAIL_LENGTH;
}

function calculatePixelOpacity(
  headIdx: number,
  pixelIdx: number | undefined
): number {
  if (pixelIdx === undefined) return NON_ACTIVE_OPACITY;

  const distance = calculatePixelDistance(headIdx, pixelIdx);
  const step = 100 / TAIL_LENGTH;
  return distance < TAIL_LENGTH ? 100 - distance * step : NON_ACTIVE_OPACITY;
}

interface PixelSpinnerProps {
  className?: string;
  /** Pixel size in pixels (default: 3.5) */
  pixelSize?: number;
}

export function PixelSpinner({
  className,
  pixelSize = 3.5,
}: PixelSpinnerProps) {
  const [headIndex, setHeadIndex] = useState(0);
  const pixelIndices = useMemo(
    () => Array.from({ length: 9 }, (_, i) => i),
    []
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setHeadIndex((prev) => (prev + 1) % RING_SIZE);
    }, INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <div
      className={cn("pixel-spinner", className)}
      style={
        pixelSize
          ? ({ "--pixel-size": `${pixelSize}px` } as React.CSSProperties)
          : undefined
      }
    >
      <div className="grid grid-cols-3 gap-px">
        {pixelIndices.map((idx) => {
          const animIdx = renderToAnimation[idx];
          return (
            <span
              key={idx}
              className={idx === 4 ? "pixel-center" : "pixel"}
              style={{
                opacity: calculatePixelOpacity(headIndex, animIdx) / 100,
                backgroundColor: isPixelActive(headIndex, animIdx)
                  ? "var(--active-color)"
                  : "var(--inactive-color)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
