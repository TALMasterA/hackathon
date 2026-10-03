import { LockKeyhole } from "lucide-react";
import { FURNITURE_COLORS } from "@/components/scene/palette";
import { formatCm } from "@/i18n/dictionary";
import { editorText } from "@/i18n/editor";
import type { FlatFurniture, ItemChange, Language } from "@/types/domain";

export function ItemList({ furniture, selectedId, positionLocks, language, changes = {}, removed = [], onSelect }: { furniture: readonly FlatFurniture[]; selectedId: string | null; positionLocks: readonly string[]; language: Language; changes?: Record<string, ItemChange[]>; removed?: readonly FlatFurniture[]; onSelect: (id: string) => void }) {
  return (
    <section className="furniture-list-section" aria-labelledby="furniture-list-title">
      <h2 id="furniture-list-title">{editorText(language, "editor.items")} <span>{furniture.length}</span></h2>
      <ul className="furniture-list">{furniture.map((item) => <li key={item.id} data-change={changes[item.id]?.join(" ") ?? ""}><button type="button" data-testid={`list-item-${item.id}`} className={selectedId === item.id ? "is-selected" : ""} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}><span className="legend-swatch" style={{ backgroundColor: FURNITURE_COLORS[item.kind] }} /><span className="item-list-text"><strong>{item.name[language]}</strong><span>{formatCm(item.width, language)} × {formatCm(item.depth, language)} × {formatCm(item.height, language)} {editorText(language, "editor.unit")}</span>{changes[item.id]?.length > 0 && <span className="item-changes">{changes[item.id].map((change) => editorText(language, `editor.change.${change}`)).join(" · ")}</span>}</span>{positionLocks.includes(item.id) && <LockKeyhole size={15} aria-label={editorText(language, "locks.locked")} />}</button></li>)}{removed.map((item) => <li key={`removed-${item.id}`} data-change="removed" className="removed-item"><span>{item.name[language]}</span><span>{editorText(language, "editor.change.removed")}</span></li>)}</ul>
    </section>
  );
}