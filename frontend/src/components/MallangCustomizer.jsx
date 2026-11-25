import { useState } from "react";
import Icon from "./Icon";
import { MallangEyes, MallangMouth } from "./MallangFace";
import { MALLANG_EYES, MALLANG_MOUTHS } from "../utils/mallangCustomization";
import { getMallangPalette, getMallangWaxPalette, MALLANG_THEMES, rgbColor } from "../utils/mallangTheme";

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

function swatchBackground(theme, surface) {
  if (surface === "wax") {
    const { light, middle, rim, dark } = getMallangWaxPalette(theme);
    return `radial-gradient(ellipse 72% 72% at 35.5% 26.5%, ${light}, ${middle} 43%, ${rim} 80%, ${dark})`;
  }

  const { skin, skinLight, skinEdge, flat } = getMallangPalette(theme);
  if (surface === "2d") return rgbColor(flat);
  return `linear-gradient(135deg, ${rgbColor(skinLight, .65)}, ${rgbColor(skinLight, 0)} 50%),
    radial-gradient(circle closest-side, ${rgbColor(skin)} 35%, ${rgbColor(skinEdge)})`;
}

export default function MallangCustomizer({ id, look, surface, onChange, onClose }) {
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
          <button key={theme} type="button" className="mallang-theme-swatch"
            style={{ "--swatch-background": swatchBackground(theme, surface), "--swatch-accent": accent }}
            aria-pressed={look.theme === theme} onClick={() => onChange({ theme })}>
            <span className="mallang-theme-dot" aria-hidden="true">
              {look.theme === theme && <span className="mallang-theme-check"><Icon name="check" /></span>}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <p>앱 전체와 말랑이의 색이 함께 바뀌어요.</p>
    </> : <FaceOptions field={section} look={look} onChange={onChange} />}
  </section>;
}
