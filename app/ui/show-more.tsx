"use client";

import { Children, useState, type ReactNode } from "react";

/** Shows the first few children and a "Show all N" button for the rest. */
export function ShowMore({ initial = 3, label, children }: { initial?: number; label?: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, initial);
  return (
    <>
      {shown}
      {items.length > initial && !all && (
        <div className="border-t border-rule px-(--gutter) py-3">
          <button type="button" onClick={() => setAll(true)} className="text-body text-accent hover:underline">
            {label ?? `Show all ${items.length}`}
          </button>
        </div>
      )}
    </>
  );
}
