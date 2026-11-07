import { useEffect, useState } from "react";

/** A shared clock for ticking timers. Leaf components use it so parents do not render every second. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 14m 03s, or 1h 04m once past an hour. */
export function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${pad(minutes)}m` : `${minutes}m ${pad(seconds % 60)}s`;
}

/** 0:42 clock form for dense rows. */
export function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`;
}

/** Time since `from`, ticking every second until `to` is set. */
export function Elapsed({ from, to, short }: { from: number; to?: number; short?: boolean }) {
  const now = useNow(1000);
  const ms = (to ?? now) - from;
  return <span className="tn">{short ? clock(ms) : duration(ms)}</span>;
}
