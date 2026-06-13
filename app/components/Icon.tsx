import type { CSSProperties } from "react";

type IconProps = {
  name: string;
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Material Symbols icoon in de "stamp & patch" stijl van Sunseeker. */
export function Icon({ name, filled, className = "", style }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined${filled ? " fill" : ""} ${className}`}
      style={style}
      aria-hidden
    >
      {name}
    </span>
  );
}
