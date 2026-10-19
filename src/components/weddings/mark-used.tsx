"use client";

import { useEffect } from "react";
import { markWeddingUsedAction } from "@/app/actions/weddings";

/** Remembers that the couple opened this wedding, once the page is really shown (not on link prefetches). */
export function MarkWeddingUsed({ weddingId }: { weddingId: string }) {
  useEffect(() => {
    void markWeddingUsedAction(weddingId);
  }, [weddingId]);
  return null;
}
