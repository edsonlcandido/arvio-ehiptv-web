"use client";

import { Cloud } from "lucide-react";
import { useApp } from "@/lib/store";

export function SyncStrip() {
  const { busy } = useApp();
  return (
    <div className="sync-strip" aria-hidden={!busy}>
      <Cloud size={16} />
      <span>{busy || "Pronto"}</span>
    </div>
  );
}
