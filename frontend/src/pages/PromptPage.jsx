import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import client from "../api/client";

const EXAMPLE = "요즘 코딩 공부를 하고 있어요. 10분 안에 해볼 수 있는 연습 미션을 받고 싶어요.";

export default function PromptPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["user-prompt"],
    queryFn: ({ signal }) => client.get("/api/user/prompt", { signal }).then((r) => r.data),
  });
  const saved = data?.custom_prompt ?? "";
  const text = draft ?? saved;

  const mutation = useMutation({
    mutationFn: (value) => client.put("/api/user/prompt", { custom_prompt: value }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["user-prompt"] });
      toast.success("미션 요청을 저장했어요.");
    },
    onError: () => toast.error("저장에 실패했어요."),
  });

  return (
    <div className="profile-page">
      <header className="diary-header">
        <button onClick={() => navigate(-1)}>← 뒤로</button>
        <h2>미션 맞춤 설정</h2>
      </header>

      <main className="profile-content">
        <form className="mission-preferences" onSubmit={(event) => {
          event.preventDefault();
          if (data && !mutation.isPending && text !== saved) mutation.mutate(text);
        }}>
          <label htmlFor="mission-preferences-text">어떤 미션을 받고 싶나요?</label>
          <p id="mission-preferences-help">
            다음 미션을 만들 때 AI가 참고해요. 요즘 하는 일, 관심사, 쓸 수 있는 시간을 적어 보세요.
            비워 두면 기본 추천을 받아요.
          </p>
          <div className="mission-preferences-example">
            <p><strong>작성 예시</strong> {EXAMPLE}</p>
            {data && !text.trim() && (
              <button
                type="button"
                className="mission-done-btn"
                onClick={() => setDraft(EXAMPLE)}
                disabled={mutation.isPending}
              >예시 넣기</button>
            )}
          </div>

          {isPending && <p className="mission-empty">저장한 요청을 불러오는 중이에요.</p>}
          {isError && !data && (
            <button type="button" className="mission-done-btn" onClick={() => refetch()}>다시 불러오기</button>
          )}
          {data && (
            <>
              <textarea
                id="mission-preferences-text"
                aria-describedby="mission-preferences-help"
                className="diary-textarea"
                placeholder="요즘 관심 있는 일과 원하는 미션을 적어 보세요."
                value={text}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="diary-save-btn" disabled={mutation.isPending || text === saved}>
                {mutation.isPending ? "저장 중…" : "미션 요청 저장"}
              </button>
            </>
          )}
        </form>
      </main>
    </div>
  );
}
