import { House, Sofa } from "lucide-react";
import { SUGGESTED_FURNITURE } from "@/data/flat-preset";
import { editorText } from "@/i18n/editor";
import { suggestionMessage } from "@/i18n/editor-messages";
import type { Flat, FlatFurniture, Language, SuggestionReport } from "@/types/domain";

export function SuggestionsPanel({ flat, roomId, furniture, editable, report, language, onSuggest }: { flat: Flat; roomId: string; furniture: readonly FlatFurniture[]; editable: boolean; report: SuggestionReport | null; language: Language; onSuggest: (roomId: string) => void }) {
  const room = flat.rooms.find((entry) => entry.id === roomId);
  const complete = SUGGESTED_FURNITURE.every((suggestion) => furniture.some((item) => item.id === suggestion.id));
  return (
    <section className="suggestions-panel" aria-labelledby="suggestions-title" data-testid="suggestions-panel">
      <h2 id="suggestions-title">{editorText(language, "suggest.title")}</h2>
      <p className="constraint-note">{editorText(language, "suggest.note")}</p>
      <div className="suggestion-actions">
        <button type="button" className="secondary-button" disabled={!editable || complete} onClick={() => onSuggest("all")}><House size={17} aria-hidden="true" />{editorText(language, "suggest.all")}</button>
        {room && <button type="button" className="secondary-button" disabled={!editable} onClick={() => onSuggest(room.id)}><Sofa size={17} aria-hidden="true" />{editorText(language, "suggest.room", { room: room.name[language] })}</button>}
      </div>
      {report && <p className="suggestion-status" role="status">{suggestionMessage(report, language)}</p>}
    </section>
  );
}
