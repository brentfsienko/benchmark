"use client";

import { useEffect, useState } from "react";

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 2200);
    const t2 = setTimeout(onDone, 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);
  return <div className={`toast${exiting ? " toast-exit" : ""}`}>{message}</div>;
}
