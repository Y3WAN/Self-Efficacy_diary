import { useEffect, useId, useRef } from "react";

export default function AppDialog({ title, onDismiss, children, busy = false }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="app-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
    >
      <div className="app-dialog-panel">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
