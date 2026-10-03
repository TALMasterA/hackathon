import { ChevronDown, ExternalLink, Info } from "lucide-react";
import { SOURCE_URLS } from "@/data/preset";
import { translate } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import type { Flat, Language } from "@/types/domain";

export function SourcePanel({ language, flat }: { language: Language; flat?: Flat }) {
  const text = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return (
    <section className="source-panel" aria-label={text("source.heading")}>
      <details>
        <summary><Info size={17} aria-hidden="true" /><span>{text("source.heading")}</span><ChevronDown className="disclosure-chevron" size={17} aria-hidden="true" /></summary>
        <div className="source-body">
          {flat?.source ? <>
            <p className="scenario-name">{flat.name[language]} · {editorText(language, "source.harmony.page", { page: flat.source.page })}</p>
            <p className="verify-note">{editorText(language, "source.harmony.warning")}</p>
            <p>{editorText(language, "source.harmony.scale", { scale: flat.source.scaleUnitsPerMetre, area: flat.source.envelopeAreaM2 })}</p>
            <p>{editorText(language, "source.harmony.heights")}</p>
            <p>{editorText(language, "source.harmony.zones")}</p>
            <div className="source-links"><a href={flat.source.pdfUrl} target="_blank" rel="noreferrer">{text("source.pdf")}<ExternalLink size={14} aria-hidden="true" /></a><a href={flat.source.referenceUrl} target="_blank" rel="noreferrer">{editorText(language, "source.harmony.reference")}<ExternalLink size={14} aria-hidden="true" /></a></div>
            <p>{text("source.limitations")}</p>
          </> : <>
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
          </>}
        </div>
      </details>
    </section>
  );
}