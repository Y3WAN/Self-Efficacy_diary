import client from "./client";

export function missionHistoryQuery(month) {
  return {
    queryKey: ["missions", "history", month],
    queryFn: ({ signal }) => client.get("/api/missions/history", { params: { month }, signal })
      .then((response) => response.data),
  };
}

export function diaryDayQuery(date) {
  return {
    queryKey: ["diaries", date],
    queryFn: ({ signal }) => client.get(`/api/diaries/${date}`, { signal }).then((response) => response.data),
  };
}
