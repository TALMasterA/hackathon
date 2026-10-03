import { ChevronDown, ExternalLink, Info } from "lucide-react";
import { SOURCE_URLS } from "@/data/preset";
import { translate } from "@/i18n/dictionary";
import type { Language } from "@/types/domain";

export function SourcePanel({ language }: { language: Language }) {
  const text = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return (
    <section className="source-panel" aria-label={text("source.heading")}>
      <details>
        <summary><Info size={17} aria-hidden="true" /><span>{text("source.heading")}</span><ChevronDown className="disclosure-chevron" size={17} aria-hidden="true" /></summary>
        <div className="source-body">
          <p className="scenario-name">{text("room.scenario")}</p>
          <p className="verify-note">{text("source.verify")}</p>
          <p>{text("source.assumptions")}</p>
          <p>{text("source.plan")}</p>
          <p>{text("source.zones")}</p>
          <div className="source-links">
            <a href={SOURCE_URLS.index} target="_blank" rel="noreferrer">{text("source.index")}<ExternalLink size={14} aria-hidden="true" /></a>
            <a href={SOURCE_URLS.pdf} target="_blank" rel="noreferrer">{text("source.pdf")}<ExternalLink size={14} aria-hidden="true" /></a>
          </div>
          <p>{text("source.limitations")}</p>
        </div>
      </details>
    </section>
  );
}