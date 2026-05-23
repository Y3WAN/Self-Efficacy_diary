import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";

export default function DiaryEditorPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];
  const isToday = date === today;

  const { data: diaries = [], isLoading } = useQuery({
    queryKey: ["diaries", date],
    queryFn: () => client.get(`/api/diaries/${date}`).then((r) => r.data),
    enabled: !!date,
  });

  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["diaries", date] });
    qc.invalidateQueries({ queryKey: ["diaries", "month"] });
  };

  const createMutation = useMutation({
    mutationFn: () => client.post("/api/diaries", { content: newContent, diary_date: date }),
    onSuccess: () => { setNewContent(""); invalidate(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }) => client.patch(`/api/diaries/${id}`, { content }),
    onSuccess: () => { setEditingId(null); invalidate(); },
  });

  if (isLoading) return <div className="page-loading">불러오는 중...</div>;

  return (
    <div className="diary-editor-page">
      <header className="diary-header">
        <button onClick={() => navigate(-1)}>← 뒤로</button>
        <h2>{date}</h2>
      </header>

      <div className="diary-entries">
        {diaries.length === 0 && (
          <p className="diary-empty">이 날의 일기가 없어요.</p>
        )}
        {diaries.map((d) => (
          <div key={d.id} className="diary-entry">
            {editingId === d.id ? (
              <>
                <textarea
                  className="diary-textarea"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                />
                <div className="diary-actions">
                  <button onClick={() => updateMutation.mutate({ id: d.id, content: editContent })}>저장</button>
                  <button onClick={() => setEditingId(null)}>취소</button>
                </div>
              </>
            ) : (
              <>
                <p className="diary-content">{d.content}</p>
                <div className="diary-meta">
                  <span>{new Date(d.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                  {!d.is_locked && isToday && (
                    <button onClick={() => { setEditingId(d.id); setEditContent(d.content); }}>수정</button>
                  )}
                  {d.is_locked && <span className="locked-badge">🔒</span>}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {isToday && (
        <div className="diary-write-area">
          <textarea
            className="diary-textarea"
            placeholder="오늘 있었던 일을 자유롭게 써봐요..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="diary-write-footer">
            <span className="char-count">{newContent.length}자</span>
            <button
              className="diary-save-btn"
              onClick={() => createMutation.mutate()}
              disabled={!newContent.trim()}
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
