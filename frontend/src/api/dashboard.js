import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import client from "./client";
import { dateLocal } from "../utils/date";
import { shiftRecordDate } from "../utils/recordDate";

const MALLANG_TREND_DAYS = 15;
export const PROFILE_DIARY_LIMIT = 15;

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
  const start = shiftRecordDate(today, 1 - MALLANG_TREND_DAYS);
  return useQuery({
    queryKey: ["dashboard", "daily", today],
    queryFn: ({ signal }) => client.get("/api/dashboard/daily", {
      signal, params: { diary_since: start, through: today },
    }).then((response) => response.data),
  });
}

export function useDiaryEfficacyTrend() {
  const today = useLocalToday();
  return useQuery({
    queryKey: ["dashboard", "daily", "diaries", today],
    queryFn: ({ signal }) => client.get("/api/dashboard/daily", {
      signal, params: { diary_limit: PROFILE_DIARY_LIMIT, through: today },
    }).then((response) => response.data),
  });
}
