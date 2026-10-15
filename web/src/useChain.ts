import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CACHE_KEY } from "./config";
import { loadState, verifyContract } from "./chain";
import {
  getHistory,
  projectHistory,
  syncHistory,
  type History,
} from "./events";
import { deserialize, serialize, type ChainState } from "./model";
import { humanError } from "./errors";
function cachedState(): ChainState | undefined {
  try {
    const text = localStorage.getItem(CACHE_KEY);
    if (!text) return;
    const s = deserialize<ChainState>(text);
    if (
      typeof s.block === "bigint" &&
      typeof s.vault === "bigint" &&
      typeof s.bank === "bigint" &&
      typeof s.total === "bigint" &&
      typeof s.oracle === "bigint" &&
      typeof s.at === "number" &&
      s.batches &&
      s.batches[s.openId]
    )
      return s;
  } catch {
    /* ignore a damaged cache */
  }
}
export function useChain() {
  const [state, setState] = useState<ChainState | undefined>(cachedState);
  const [history, setHistory] = useState<History>();
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(0);
  const historyRef = useRef<History | undefined>(undefined);
  const busy = useRef(false),
    historyBusy = useRef(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const updateHistory = useCallback(async (head: bigint) => {
    if (historyBusy.current) return;
    historyBusy.current = true;
    try {
      if (!historyRef.current) historyRef.current = await getHistory();
      const before = projectHistory(historyRef.current).length;
      historyRef.current = await syncHistory(
        historyRef.current,
        head,
        (h) => {
          historyRef.current = h;
          setHistory(h);
        },
        controller.current!.signal,
      );
      if (projectHistory(historyRef.current).length > before)
        setPulse((p) => p + 1);
      setHistoryError("");
    } catch (e) {
      setHistoryError(humanError(e));
    } finally {
      historyBusy.current = false;
    }
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const activeIds = historyRef.current
        ? [
            ...new Set(
              projectHistory(historyRef.current)
                .filter((a) => a.status < 3)
                .map((a) => a.batchId),
            ),
          ]
        : [];
      const next = await loadState(activeIds);
      if (controller.current?.signal.aborted) return;
      setState(next);
      setError("");
      try {
        localStorage.setItem(CACHE_KEY, serialize(next));
      } catch {
        /* cache is optional */
      }
      void updateHistory(next.block);
      try {
        await verifyContract();
        setVerified(true);
      } catch (e) {
        setVerified(false);
        setError(humanError(e));
      }
    } catch (e) {
      setError(humanError(e));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [updateHistory]);
  useEffect(() => {
    controller.current = new AbortController();
    void getHistory().then((h) => {
      if (!controller.current?.signal.aborted && !historyRef.current) {
        historyRef.current = h;
        setHistory(h);
      }
    });
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  const attempts = useMemo(
    () => (history ? projectHistory(history) : []),
    [history],
  );
  return {
    state,
    attempts,
    history,
    loading,
    error,
    historyError,
    verified,
    refresh,
    pulse,
  };
}
