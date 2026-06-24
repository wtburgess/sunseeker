import type { CSSProperties } from "react";
import { WEATHER_GLYPHS } from "../lib/weatherGlyphs";

type IconProps = {
  name: string;
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Material Symbols icoon in de "stamp & patch" stijl van Sunseeker. */
export function Icon({ name, filled, className = "", style }: IconProps) {
  // Eigen weer-glyphs (regen-streepjes, onweer) worden als inline-SVG getekend
  // en schalen mee met font-size (1em) en tekstkleur (currentColor).
  const glyph = WEATHER_GLYPHS[name];
  if (glyph) {
    return (
      <svg
        viewBox={glyph.viewBox}
        width="1em"
        height="1em"
        fill="none"
        className={className}
        style={style}
        aria-hidden
        dangerouslySetInnerHTML={{ __html: glyph.body }}
      />
    );
  }

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
