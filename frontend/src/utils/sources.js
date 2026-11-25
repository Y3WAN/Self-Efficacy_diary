// 자기효능감의 4가지 원천(Bandura, 1977). 정의가 있는 용어라 이론 이름을 그대로 쓰고 뜻풀이를 붙인다.
// short: 그래프 이름 아래 붙는 쉬운 말
// link: 메인 레이더 그래프에서 글자를 눌렀을 때 이동할 곳
export const SOURCES = [
  { key: "m", code: "M", label: "성취 경험", short: "내가 해낸 일", desc: "내가 직접 해 보고 해낸 경험", link: "mission" },
  { key: "v", code: "V", label: "대리 경험", short: "남을 보고 배움", desc: "다른 사람이 해내는 걸 보고 '나도 할 수 있겠다' 느낀 경험", link: "/community" },
  { key: "p", code: "P", label: "사회적 설득", short: "응원·칭찬", desc: "주변에서 '넌 할 수 있어'라는 말이나 칭찬을 들은 경험", link: "/community?focus=cheer" },
  { key: "a", code: "A", label: "정서·신체 상태", short: "마음·몸 컨디션", desc: "마음이 편안하고 몸 컨디션이 좋았던 상태", link: "/mallang" },
];

export const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]));
