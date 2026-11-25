// CSS가 안 먹는 브라우저까지 대비해, 입력칸 밖에서 시작하는 선택·끌기를 막는다.
const EDITABLE = 'input, textarea, [contenteditable="true"]'

function isEditable(target) {
  const el = target?.nodeType === 1 ? target : target?.parentElement
  return Boolean(el?.closest?.(EDITABLE))
}

export function blockTextSelection() {
  document.addEventListener('selectstart', (e) => {
    if (!isEditable(e.target)) e.preventDefault()
  })
  document.addEventListener('dragstart', (e) => {
    if (!isEditable(e.target)) e.preventDefault()
  })
}
