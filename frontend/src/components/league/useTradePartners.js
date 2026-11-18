import { useEffect, useState } from "react";
import { fetchJson } from "../../lib/api";
import { mergePartnerPage } from "./tradeSuggestionState";

// Keep page requests and their results tied to the complete set of current preferences.
export default function useTradePartners(requestKey, enabled) {
  const [page, setPage] = useState({ key: "", offset: 0, attempt: 0 });
  const [scan, setScan] = useState(null);
  const offset = page.key === requestKey ? page.offset : 0;
  const attempt = page.key === requestKey ? page.attempt : 0;

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    // A short pause also groups repeated keyboard slider edits into one request.
    const timer = setTimeout(() => {
      fetchJson("/api/trade-suggestions/compatible-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ ...JSON.parse(requestKey), verification_offset: offset }),
      }).then((data) => {
        if (controller.signal.aborted) return;
        if (data?.status !== "ok" || !Array.isArray(data.partners)) {
          throw new Error("Could not load compatible partners.");
        }
        setScan((old) => ({
          key: requestKey, offset, attempt, error: "",
          partners: mergePartnerPage(old?.key === requestKey ? old.partners : [], data.partners),
          analysis: data.your_analysis, warnings: data.warnings || [],
          nextOffset: data.verification?.next_offset ?? null,
        }));
      }).catch((error) => {
        if (!controller.signal.aborted) {
          setScan((old) => ({
            ...(old?.key === requestKey ? old : { partners: [], warnings: [] }),
            key: requestKey, offset, attempt, error: error.message,
          }));
        }
      });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, offset, attempt, enabled]);

  // Hide old cards immediately during render, before the next effect starts its request.
  const current = scan?.key === requestKey ? scan : null;
  return {
    partners: current?.partners || [], analysis: current?.analysis,
    warnings: current?.warnings || [], error: current?.error || "",
    loading: enabled && (!current || current.offset !== offset || current.attempt !== attempt),
    visibleCount: offset + 3, nextOffset: current?.nextOffset,
    loadMore: () => {
      if (current?.nextOffset != null) setPage({ key: requestKey, offset: current.nextOffset, attempt: 0 });
    },
    retry: () => setPage({ key: requestKey, offset, attempt: attempt + 1 }),
  };
}
