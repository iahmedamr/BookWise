import { useRef, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface DualRangeSliderProps {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatLabel?: (v: number) => string;
  className?: string;
}

export default function DualRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  formatLabel,
  className,
}: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"min" | "max" | null>(null);
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState<"min" | "max" | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const snap = (v: number) => Math.round((v - min) / step) * step + min;

  const posToValue = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return min;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      return snap(clamp(min + ratio * (max - min)));
    },
    [min, max, step],
  );

  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  // ── Pointer drag ──────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (handle: "min" | "max") => (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = handle;
      setActive(handle);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const v = posToValue(e.clientX);
      if (dragging.current === "min") {
        onChange([Math.min(v, value[1] - step), value[1]]);
      } else {
        onChange([value[0], Math.max(v, value[0] + step)]);
      }
    },
    [dragging, posToValue, value, onChange, step],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = null;
    setActive(null);
  }, []);

  // ── Press-and-hold arrow buttons ──────────────────────────────────────────
  const startHold = useCallback(
    (handle: "min" | "max", direction: -1 | 1) => {
      const tick = () => {
        onChange((prev: [number, number]) => {
          if (handle === "min") {
            const next = clamp(snap(prev[0] + direction * step));
            return [Math.min(next, prev[1] - step), prev[1]];
          } else {
            const next = clamp(snap(prev[1] + direction * step));
            return [prev[0], Math.max(next, prev[0] + step)];
          }
        });
      };

      tick(); // immediate first tick
      holdTimeout.current = setTimeout(() => {
        holdInterval.current = setInterval(tick, 80);
      }, 350);
    },
    [clamp, snap, step, onChange],
  );

  const stopHold = useCallback(() => {
    if (holdTimeout.current) clearTimeout(holdTimeout.current);
    if (holdInterval.current) clearInterval(holdInterval.current);
    holdTimeout.current = null;
    holdInterval.current = null;
  }, []);

  useEffect(() => () => stopHold(), [stopHold]);

  const fmt = formatLabel ?? String;

  return (
    <div className={cn("select-none", className)}>
      {/* Value labels */}
      <div className="flex justify-between text-xs font-medium mb-3 text-foreground">
        <span className="tabular-nums">{fmt(value[0])}</span>
        <span className="tabular-nums">{fmt(value[1])}</span>
      </div>

      {/* Track + handles */}
      <div
        ref={trackRef}
        className="relative h-6 flex items-center cursor-default"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Background rail */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-secondary" />

        {/* Active fill */}
        <div
          className="absolute h-1.5 rounded-full bg-primary"
          style={{
            left: `${pct(value[0])}%`,
            width: `${pct(value[1]) - pct(value[0])}%`,
          }}
        />

        {/* Min handle */}
        <div
          className={cn(
            "absolute w-5 h-5 rounded-full border-2 border-primary bg-background shadow-md cursor-grab touch-none transition-transform",
            active === "min" &&
              "scale-125 cursor-grabbing shadow-lg ring-2 ring-primary/40",
          )}
          style={{ left: `calc(${pct(value[0])}% - 10px)` }}
          onPointerDown={onPointerDown("min")}
          role="slider"
          aria-valuenow={value[0]}
          aria-valuemin={min}
          aria-valuemax={value[1]}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              const next = clamp(snap(value[0] - step));
              onChange([Math.min(next, value[1] - step), value[1]]);
            } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              const next = clamp(snap(value[0] + step));
              onChange([Math.min(next, value[1] - step), value[1]]);
            }
          }}
        />

        {/* Max handle */}
        <div
          className={cn(
            "absolute w-5 h-5 rounded-full border-2 border-primary bg-background shadow-md cursor-grab touch-none transition-transform",
            active === "max" &&
              "scale-125 cursor-grabbing shadow-lg ring-2 ring-primary/40",
          )}
          style={{ left: `calc(${pct(value[1])}% - 10px)` }}
          onPointerDown={onPointerDown("max")}
          role="slider"
          aria-valuenow={value[1]}
          aria-valuemin={value[0]}
          aria-valuemax={max}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              const next = clamp(snap(value[1] - step));
              onChange([value[0], Math.max(next, value[0] + step)]);
            } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              const next = clamp(snap(value[1] + step));
              onChange([value[0], Math.max(next, value[0] + step)]);
            }
          }}
        />
      </div>

      {/* Step buttons row */}
      <div className="flex justify-between mt-2">
        {/* Min side buttons */}
        <div className="flex items-center gap-1">
          <button
            className="w-6 h-6 rounded border text-xs font-bold flex items-center justify-center hover:bg-muted active:bg-muted/80 select-none"
            onMouseDown={() => startHold("min", -1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={() => startHold("min", -1)}
            onTouchEnd={stopHold}
            tabIndex={-1}
            aria-label="Decrease min"
          >
            −
          </button>
          <button
            className="w-6 h-6 rounded border text-xs font-bold flex items-center justify-center hover:bg-muted active:bg-muted/80 select-none"
            onMouseDown={() => startHold("min", 1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={() => startHold("min", 1)}
            onTouchEnd={stopHold}
            tabIndex={-1}
            aria-label="Increase min"
          >
            +
          </button>
        </div>

        {/* Max side buttons */}
        <div className="flex items-center gap-1">
          <button
            className="w-6 h-6 rounded border text-xs font-bold flex items-center justify-center hover:bg-muted active:bg-muted/80 select-none"
            onMouseDown={() => startHold("max", -1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={() => startHold("max", -1)}
            onTouchEnd={stopHold}
            tabIndex={-1}
            aria-label="Decrease max"
          >
            −
          </button>
          <button
            className="w-6 h-6 rounded border text-xs font-bold flex items-center justify-center hover:bg-muted active:bg-muted/80 select-none"
            onMouseDown={() => startHold("max", 1)}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={() => startHold("max", 1)}
            onTouchEnd={stopHold}
            tabIndex={-1}
            aria-label="Increase max"
          >
            +
          </button>
        </div>
      </div>

      {/* Min / Max ticks */}
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}
