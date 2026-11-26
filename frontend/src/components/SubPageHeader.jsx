import PageBack from "./PageBack";

export default function SubPageHeader({ title, backLabel, onBack, backRef, children }) {
  return (
    <header className={children ? "subpage-header subpage-header--with-actions" : "subpage-header"}>
      <PageBack label={backLabel} onClick={onBack} buttonRef={backRef} />
      <h1>{title}</h1>
      {children && <div className="subpage-header-actions">{children}</div>}
    </header>
  );
}
