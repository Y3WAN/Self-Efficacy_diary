import Icon from "../components/Icon";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";
import { diaryEditorQuery } from "../api/records";
import toast from "react-hot-toast";
import { todayKST } from "../utils/date";
import ReflectionCard from "../components/ReflectionCard";
import SubPageHeader from "../components/SubPageHeader";

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
      <button type="button" className="kebab-btn" aria-label="일기 메뉴" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name="more" /></button>
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

  const editorQuery = diaryEditorQuery(date);
  const { data: editor, isPending, refetch } = useQuery(editorQuery);
  const diaries = editor?.diaries ?? [];

  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (!isPending && hash.startsWith("#entry-")) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "nearest" });
    }
  }, [hash, isPending]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["diaries", date] });
    qc.invalidateQueries({ queryKey: ["diaries", "month"] });
    qc.invalidateQueries({ queryKey: ["dashboard", "daily"] });
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
    onSuccess: async ({ data: diary }) => {
      await qc.cancelQueries({ queryKey: editorQuery.queryKey });
      qc.setQueryData(editorQuery.queryKey, { diaries: [diary], can_create: false });
      setNewContent("");
      invalidate();
      reflectMutation.mutate(diary.id);
    },
    onError: (error) => {
      if (error.response?.status === 409) {
        toast.error("일기는 하루에 한 편만 쓸 수 있어요.");
        invalidate();
        return;
      }
      toast.error("일기를 저장하지 못했어요. 다시 시도해 주세요.");
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
    onSuccess: async (_response, id) => {
      await qc.cancelQueries({ queryKey: editorQuery.queryKey });
      qc.setQueryData(editorQuery.queryKey, (current) => ({
        diaries: (current?.diaries ?? []).filter((diary) => diary.id !== id),
        can_create: false,
      }));
      invalidate();
    },
    onError: () => toast.error("일기를 삭제하지 못했어요."),
  });

  const handleDelete = (id) => {
    if (window.confirm("이 일기를 삭제할까요?")) {
      deleteMutation.mutate(id);
    }
  };

  function returnToRecords() {
    if (state?.fromMain) navigate(-1);
    else navigate(`/?month=${date.slice(0, 7)}&date=${date}`, { replace: true });
  }

  return (
    <main className="diary-editor-page">
      <SubPageHeader title={isToday ? "오늘의 일기" : "그날의 일기"} onBack={returnToRecords} />
      <div className="main-content">
        <p className="diary-heading-date"><time dateTime={date}>{date}</time></p>

        {isPending && <p className="diary-empty" role="status">일기를 불러오는 중이에요.</p>}
        {!editor && !isPending && (
          <button type="button" className="diary-retry" onClick={() => refetch()}>일기 다시 불러오기</button>
        )}
        {editor && !editor.can_create && diaries.length === 0 && (
          <p className="diary-empty">{isToday ? "오늘의 일기 작성은 마쳤어요." : "이날에 남긴 일기가 없어요."}</p>
        )}
        {diaries.length > 0 && (
          <div className="diary-entries">
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
                {d.is_locked && <Icon name="lock" className="locked-badge" label="잠긴 일기" />}

                {editingId === d.id ? (
                  <>
                    <textarea
                      className="diary-textarea diary-draft"
                      aria-label="일기 수정"
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
        )}

        {editor?.can_create && (
          <form className="diary-write-area" onSubmit={(event) => {
            event.preventDefault();
            if (newContent.trim() && !createMutation.isPending) createMutation.mutate();
          }}>
            <textarea
              className="diary-textarea diary-draft"
              aria-label="오늘 일기"
              placeholder="오늘 있었던 일을 자유롭게 써봐요..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              readOnly={createMutation.isPending}
            />
            <div className="diary-write-footer">
              <span className="char-count">{newContent.length}자</span>
              <button type="submit" className="diary-save-btn" disabled={!newContent.trim() || createMutation.isPending}>
                {createMutation.isPending ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
