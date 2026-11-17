import Icon from "./Icon";

export default function BrandMark({ className }) {
  return (
    <span className={className ? `brand-mark ${className}` : "brand-mark"}>
      <Icon name="sprout" className="brand-symbol" />
      <span>codemyworld</span>
    </span>
  );
}
