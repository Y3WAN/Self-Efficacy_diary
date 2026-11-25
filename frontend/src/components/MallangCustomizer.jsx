import { useState } from "react";
import Icon from "./Icon";
import { MallangEyes, MallangMouth } from "./MallangFace";
import { MALLANG_EYES, MALLANG_MOUTHS } from "../utils/mallangCustomization";
import { MALLANG_THEMES } from "../utils/mallangTheme";

const sections = [
  { id: "eyes", label: "눈" },
  { id: "mouth", label: "입" },
  { id: "theme", label: "테마 색" },
];

function FaceOptions({ field, look, onChange }) {
  const isEyes = field === "eyes";
  const options = isEyes ? MALLANG_EYES : MALLANG_MOUTHS;
  const label = isEyes ? "눈" : "입";
  return <div className="mallang-shape-options" role="group" aria-label={label + " 모양"}>
    {options.map(({ id, label: optionLabel }) => (
      <button key={id} type="button" className="mallang-shape-option" aria-pressed={look[field] === id}
        onClick={() => onChange({ [field]: id })}>
        <svg aria-hidden="true" viewBox={isEyes ? "73 81 54 26" : "81 101 38 31"}>
          {isEyes ? <MallangEyes variant={id} /> : <MallangMouth variant={id} />}
        </svg>
        <span>{optionLabel}</span>
      </button>
    ))}
  </div>;
}

export default function MallangCustomizer({ id, look, onChange, onClose }) {
  const [section, setSection] = useState("eyes");
  return <section className="mallang-customizer" id={id} aria-labelledby={id + "-title"}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }}>
    <header className="mallang-customizer-header">
      <h2 id={id + "-title"}>말랑이 꾸미기</h2>
      <button type="button" className="mallang-customizer-close" aria-label="꾸미기 닫기" onClick={onClose}>
        <Icon name="close" />
      </button>
    </header>
    <div className="mallang-customizer-sections" role="group" aria-label="꾸미기 항목">
      {sections.map(({ id: sectionId, label }) => (
        <button key={sectionId} type="button" aria-pressed={section === sectionId}
          onClick={() => setSection(sectionId)}>{label}</button>
      ))}
    </div>
    {section === "theme" ? <>
      <div className="mallang-theme-options" role="group" aria-label="테마 색 선택">
        {MALLANG_THEMES.map(({ id: theme, label, accent }) => (
          <button key={theme} type="button" className="mallang-theme-swatch" style={{ "--swatch-color": accent }}
            aria-pressed={look.theme === theme} onClick={() => onChange({ theme })}>
            <span className="mallang-theme-dot" aria-hidden="true">
              {look.theme === theme && <Icon name="check" />}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <p>앱 전체와 말랑이의 색이 함께 바뀌어요.</p>
    </> : <FaceOptions field={section} look={look} onChange={onChange} />}
  </section>;
}
