import React from "react";
import { SUPPORTED_LANGUAGES, type LanguageOption } from "../utils/languages";

interface LanguageSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
  dataTour?: string;
  showEnglishLabel?: boolean;
}

export function LanguageSelect({
  value,
  onChange,
  className = "min-h-12 rounded-xl border p-3 bg-white text-slate-800 font-medium",
  id,
  ariaLabel = "Select Language",
  dataTour,
  showEnglishLabel = true,
}: LanguageSelectProps) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      data-tour={dataTour}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {SUPPORTED_LANGUAGES.map((lang: LanguageOption) => (
        <option key={lang.code} value={lang.code}>
          {lang.nativeLabel} {showEnglishLabel && lang.label !== lang.nativeLabel ? `(${lang.label})` : ""}
        </option>
      ))}
    </select>
  );
}
