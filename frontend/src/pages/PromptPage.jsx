import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import client from "../api/client";

export default function PromptPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["user-prompt"],
    queryFn: () => client.get("/api/user/prompt").then((r) => r.data),
  });

  useEffect(() => {
    if (data && text === null) setText(data.custom_prompt ?? "");
  }, [data]);

  const mutation = useMutation({
    mutationFn: (val) => client.put("/api/user/prompt", { custom_prompt: val }),
    onSuccess: () => {
      qc.invalidateQueries(["user-prompt"]);
      toast.success("저장했어요!");
    },
    onError: () => toast.error("저장에 실패했어요."),
  });

  const handleSave = () => mutation.mutate(text);

  return (
    <div className="profile-page">
      <div className="diary-header">
        <button onClick={() => navigate(-1)}>← 뒤로</button>
        <h2>미션 프롬프트</h2>
      </div>

      <div className="profile-content">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ fontSize: "14px", color: "var(--text-soft)", lineHeight: 1.6, margin: 0 }}>
            여기에 쓴 내용은 매일 아침 미션을 만들 때 AI가 참고해요.<br />
            요즘 상황, 집중하고 싶은 영역, 원하는 미션 방향 등 자유롭게 적어보세요.
          </p>

          {isLoading || text === null ? (
            <div className="page-loading">불러오는 중…</div>
          ) : (
            <textarea
              className="diary-textarea"
              style={{ minHeight: "200px", resize: "vertical" }}
              placeholder="예) 요즘 취업 준비 중이에요. 자기소개서 쓰는 게 힘들어요. 관련 미션을 내줘요."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          <button
            onClick={handleSave}
            disabled={mutation.isPending || text === null}
            style={{
              background: "var(--orange)",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              padding: "14px",
              fontSize: "15px",
              fontWeight: 700,
              cursor: "pointer",
              opacity: mutation.isPending ? 0.6 : 1,
            }}
          >
            {mutation.isPending ? "저장 중…" : "저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
