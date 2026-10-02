import { Armchair, RotateCcw } from "lucide-react";
import { translate } from "@/i18n/dictionary";
import type { Language } from "@/types/domain";

interface AppHeaderProps {
  language: Language;
  onLanguage: (language: Language) => void;
  onReset: () => void;
}

export function AppHeader({ language, onLanguage, onReset }: AppHeaderProps) {
  const text = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return (
    <header className="app-header">
      <a href="#main" className="wordmark" aria-label="FitIn">
        <span className="brand-mark"><Armchair size={23} aria-hidden="true" /></span>
        <span>FitIn<span className="brand-dot">.</span></span>
      </a>
      <div className="header-actions">
        <div className="segmented language-switch" role="group" aria-label={text("app.language")}>
          <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => onLanguage("en")}>EN</button>
          <button type="button" lang="zh-Hant" aria-pressed={language === "zh-Hant"} onClick={() => onLanguage("zh-Hant")}>繁體中文</button>
        </div>
        <button type="button" className="quiet-button reset-demo" onClick={onReset} aria-label={text("app.reset")} title={text("app.reset")}>
          <RotateCcw size={17} aria-hidden="true" /><span className="button-label">{text("app.reset")}</span>
        </button>
      </div>
    </header>
  );
}