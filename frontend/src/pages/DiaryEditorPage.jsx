import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";
import { todayKST } from "../utils/date";
import ReflectionCard from "../components/ReflectionCard";

function KebabMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="kebab-wrap" ref={ref}>
      <button className="kebab-btn" onClick={() => setOpen((v) => !v)}>⋮</button>
      {open && (
        <div className="kebab-dropdown">
          <button onClick={() => { setOpen(false); onEdit(); }}>수정</button>
          <button onClick={() => { setOpen(false); onDelete(); }}>삭제</button>
        </div>
      )}
    </div>
  );
}

export default function DiaryEditorPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const { hash, state } = useLocation();
  const qc = useQueryClient();
  const today = todayKST();
  const isToday = date === today;

  const { data: diaries = [], isLoading } = useQuery({
    queryKey: ["diaries", date],
    queryFn: () => client.get(`/api/diaries/${date}`).then((r) => r.data),
    enabled: !!date,
  });

  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (!isLoading && hash.startsWith("#entry-")) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "nearest" });
    }
  }, [hash, isLoading]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["diaries", date] });
    qc.invalidateQueries({ queryKey: ["diaries", "month"] });
    qc.invalidateQueries({ queryKey: ["diaries", "recent"] });
  };

  // 일기별 AI 반응 요청 상태: { [diaryId]: { status: "pending" | "error" | "done", mission } }
  const [reactions, setReactions] = useState({});
  const setReaction = (id, value) => setReactions((prev) => ({ ...prev, [id]: value }));

  const reflectMutation = useMutation({
    mutationFn: (id) => client.post(`/api/diaries/${id}/reflect`).then((r) => r.data),
    onMutate: (id) => setReaction(id, { status: "pending" }),
    onSuccess: async (data, id) => {
      setReaction(id, { status: "done", mission: data.mission });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["diaries"] }),
        qc.invalidateQueries({ queryKey: ["missions"] }),
      ]);
    },
    onError: (_error, id) => setReaction(id, { status: "error" }),
  });

  const createMutation = useMutation({
    mutationFn: () => client.post("/api/diaries", { content: newContent, diary_date: date }),
    onSuccess: (res) => {
      setNewContent("");
      invalidate();
      reflectMutation.mutate(res.data.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, content }) => client.patch(`/api/diaries/${id}`, { content }),
    onSuccess: (res) => {
      setEditingId(null);
      invalidate();
      if (!res.data.reflection) reflectMutation.mutate(res.data.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => client.delete(`/api/diaries/${id}`),
    onSuccess: invalidate,
  });

  const handleDelete = (id) => {
    if (window.confirm("이 일기를 삭제할까요?")) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <div className="page-loading">불러오는 중...</div>;

  return (
    <div className="diary-editor-page">
      <header className="diary-header">
        <button onClick={() => {
          if (state?.fromMain) navigate(-1);
          else navigate(`/?month=${date.slice(0, 7)}`, { replace: true });
        }}>← 뒤로</button>
        <h2>{date}</h2>
      </header>

      <div className="diary-entries">
        {diaries.length === 0 && (
          <p className="diary-empty">이 날의 일기가 없어요.</p>
        )}
        {diaries.map((d) => (
          <div
            key={d.id}
            id={`entry-${d.id}`}
            className={`diary-entry${hash === `#entry-${d.id}` ? " diary-entry-selected" : ""}`}
          >
            {!d.is_locked && isToday && (
              <KebabMenu
                onEdit={() => { setEditingId(d.id); setEditContent(d.content); }}
                onDelete={() => handleDelete(d.id)}
              />
            )}
            {d.is_locked && <span className="locked-badge">🔒</span>}

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
                </div>
                <ReflectionCard
                  reflection={reactions[d.id]?.status === "pending" ? null : d.reflection}
                  mission={reactions[d.id]?.mission}
                  isPending={reactions[d.id]?.status === "pending"}
                  isError={reactions[d.id]?.status === "error"}
                  onRequest={isToday ? () => reflectMutation.mutate(d.id) : undefined}
                />
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
              disabled={!newContent.trim() || createMutation.isPending}
            >
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
