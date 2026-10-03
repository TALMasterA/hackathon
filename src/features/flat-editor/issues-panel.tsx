import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { editorText } from "@/i18n/editor";
import { layoutMessage } from "@/i18n/editor-messages";
import type { Flat, FlatFurniture, Language, LayoutViolation } from "@/types/domain";

export function CheckStatus({ count, itemCount, language }: { count: number; itemCount: number; language: Language }) {
  const Icon = itemCount === 0 ? Info : count > 0 ? TriangleAlert : CircleCheck;
  return <span className={`issue-chip ${itemCount === 0 ? "is-empty" : count > 0 ? "has-issues" : ""}`} role="status"><Icon size={16} aria-hidden="true" />{editorText(language, itemCount === 0 ? "editor.noCheck" : count > 0 ? "editor.issueCount" : "editor.noIssues", { count })}</span>;
}

export function IssuesPanel({ issues, flat, furniture, language, onFocus }: { issues: readonly LayoutViolation[]; flat: Flat; furniture: readonly FlatFurniture[]; language: Language; onFocus: (issue: LayoutViolation) => void }) {
  return (
    <section className="layout-issues" aria-labelledby="issues-title" data-testid="layout-issues" data-count={issues.length}>
      <div className="issues-heading"><h2 id="issues-title">{editorText(language, "editor.issues")}</h2><CheckStatus count={issues.length} itemCount={furniture.length} language={language} /></div>
      <p className="constraint-note">{editorText(language, "editor.constraints")}</p>
      {issues.length > 0 && <ul className="layout-issue-list">{issues.map((issue) => <li key={issue.id}><button type="button" onClick={() => onFocus(issue)}><TriangleAlert size={16} aria-hidden="true" /><span>{layoutMessage(issue, flat, furniture, language)}</span></button></li>)}</ul>}
    </section>
  );
}