// 자기효능감 4원천을 사용자에게 보여 줄 때 쓰는 쉬운 이름·설명.
// (반두라 이론 용어: 성취경험 M · 대리경험 V · 사회적 설득 P · 정서·신체 상태 A)
// link: 메인 레이더 그래프에서 글자를 눌렀을 때 이동할 곳
export const SOURCES = [
  { key: "m", code: "M", weight: 0.4, label: "해낸 경험", desc: "내가 직접 해 보고 해낸 경험", link: "mission" },
  { key: "v", code: "V", weight: 0.2, label: "보고 배운 경험", desc: "다른 사람이 해내는 걸 보고 '나도 할 수 있겠다' 느낀 경험", link: "/community" },
  { key: "p", code: "P", weight: 0.2, label: "응원받은 경험", desc: "주변에서 '넌 할 수 있어'라는 응원이나 칭찬을 받은 경험", link: "/community?focus=cheer" },
  { key: "a", code: "A", weight: 0.2, label: "마음·몸 상태", desc: "마음이 편안하고 몸 컨디션이 좋았던 상태", link: "/mallang" },
];

export const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]));
