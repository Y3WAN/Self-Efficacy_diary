import SubPageHeader from "../components/SubPageHeader";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import client from "../api/client";

const LOADING_PLACEHOLDER = "최근 일기를 보고 예시를 만드는 중이에요…";
const FALLBACK_PLACEHOLDER = "예: 미션은 10분 안에 끝낼 수 있게 만든다.";

export default function PromptPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["user-prompt"],
    queryFn: ({ signal }) => client.get("/api/user/prompt", { signal }).then((r) => r.data),
  });
  // 일기를 보고 AI가 만든 예시. 입력칸이 비어 있을 때만 흐린 글씨로 보인다.
  const suggestion = useQuery({
    queryKey: ["user-prompt-suggestion"],
    queryFn: ({ signal }) => client.get("/api/user/prompt/suggestion", { signal }).then((r) => r.data),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const placeholder = suggestion.isPending
    ? LOADING_PLACEHOLDER
    : suggestion.data?.suggestion || FALLBACK_PLACEHOLDER;
  const saved = data?.custom_prompt ?? "";
  const text = draft ?? saved;

  const mutation = useMutation({
    mutationFn: (value) => client.put("/api/user/prompt", { custom_prompt: value }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-prompt"] });
      toast.success("지침을 저장했어요. 다음 미션부터 적용돼요.");
    },
    onError: () => toast.error("저장에 실패했어요."),
  });

  return (
    <div className="profile-page">
      <SubPageHeader title="맞춤 미션" />
      <main className="profile-content">
        <form className="mission-preferences" onSubmit={(event) => {
          event.preventDefault();
          if (data && !mutation.isPending && text !== saved) mutation.mutate(text);
        }}>
          <label htmlFor="mission-preferences-text">AI에게 주는 미션 지침</label>
          <p id="mission-preferences-help">
            직접 적은 지침과 규칙을 AI가 새 미션을 만들 때마다 읽고 따라요.
            요즘 하는 일, 관심사, 쓸 수 있는 시간, 피하고 싶은 것을 적어 두세요.
            비워 두면 기본 규칙으로 미션을 만들어요.
            입력칸의 흐린 글씨는 최근 일기를 보고 AI가 추천한 예시예요.
          </p>

          {isPending && <p className="mission-empty">저장한 지침을 불러오는 중이에요.</p>}
          {isError && !data && (
            <button type="button" className="mission-done-btn" onClick={() => refetch()}>다시 불러오기</button>
          )}
          {data && (
            <>
              <textarea
                id="mission-preferences-text"
                aria-describedby="mission-preferences-help"
                className="diary-textarea"
                placeholder={placeholder}
                value={text}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="diary-save-btn" disabled={mutation.isPending || text === saved}>
                {mutation.isPending ? "저장 중…" : "지침 저장"}
              </button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
