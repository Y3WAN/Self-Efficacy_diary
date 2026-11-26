import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import client from "./client";
import { dateLocal } from "../utils/date";
import { shiftRecordDate } from "../utils/recordDate";
import { TREND_DAYS } from "../utils/efficacyTrend";

function useLocalToday() {
  const [today, setToday] = useState(() => dateLocal(Date.now()));

  useEffect(() => {
    let timer;
    function refreshDate() {
      clearTimeout(timer);
      const now = new Date();
      setToday(dateLocal(now));
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      timer = setTimeout(refreshDate, nextMidnight - now + 50);
    }

    refreshDate();
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);

  return today;
}

export function useDailyEfficacyTrend() {
  const today = useLocalToday();
  const start = shiftRecordDate(today, 1 - TREND_DAYS);
  const query = useQuery({
    queryKey: ["dashboard", "daily", today],
    queryFn: ({ signal }) => client.get("/api/dashboard/daily", {
      signal, params: { diary_since: start, through: today },
    }).then((response) => response.data),
  });

  return { ...query, start, today };
}
