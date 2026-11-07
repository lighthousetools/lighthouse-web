import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** A virtual list with variable row height and programmatic scrolling, for keyboard driven lists. */
export function VList<T>({ items, size, render, keyOf, scrollTo, className, style, overscan = 8 }: {
  items: T[]; size: number | ((item: T, index: number) => number); render: (item: T, index: number) => ReactNode;
  keyOf?: (item: T, index: number) => string | number; scrollTo?: number; className?: string; style?: CSSProperties;
  overscan?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sizeOf = (index: number) => (typeof size === "number" ? size : size(items[index]!, index));
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    estimateSize: sizeOf,
    overscan,
    getItemKey: keyOf ? (index) => keyOf(items[index]!, index) : undefined,
    initialRect: { width: 0, height: 600 },
  });
  useEffect(() => {
    virtual.measure();
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (scrollTo != null && scrollTo >= 0 && scrollTo < items.length) virtual.scrollToIndex(scrollTo, { align: "auto" });
  }, [scrollTo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className={className} style={{ overflowY: "auto", flex: 1, minHeight: 0, ...style }}>
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: sizeOf(item.index), transform: `translateY(${item.start}px)` }}
          >
            {render(items[item.index]!, item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
