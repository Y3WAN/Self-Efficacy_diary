import { useQuery } from "@tanstack/react-query";
import client from "./client";

export function useDailyEfficacyTrend() {
  return useQuery({
    queryKey: ["dashboard", "daily"],
    queryFn: ({ signal }) => client.get("/api/dashboard/daily", { signal }).then((response) => response.data),
  });
}
