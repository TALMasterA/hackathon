"use client";

import { useMemo, useState } from "react";
import { Ban, Check, Lightbulb, LoaderCircle, RotateCcw, ThumbsDown, Undo2, X } from "lucide-react";
import { formatCm } from "@/i18n/dictionary";
import { assistantText, type AssistantTranslationKey } from "@/i18n/assistant";
import { issueItemIds } from "@/lib/geometry/layout";
import type { EditorState } from "@/features/flat-editor/state";
import type { Flat, Language } from "@/types/domain";
import { getLayoutContext, type LayoutContext } from "./context";
import { interpretFeedback, resolveAmbiguous } from "./interpret";
import { formatMessage, namesFor, preferenceMessage, type Names } from "./messages";
import { detectConflicts, detectWarnings, entry, isGoal } from "./preferences";
import type { DesignAssistant } from "./use-design-assistant";
import { ZONE_DEPTHS, type AmbiguousReference, type Conflict, type DesignSession, type InvalidInput, type Message, type Preference, type PreferenceEntry, type ProposalRecord, type RejectionReason, type RejectionReasonCode, type ZoneDepth, type ZoneRef } from "./types";

interface PanelProps {
  assistant: DesignAssistant;
  editor: EditorState;
  flat: Flat;
  language: Language;
  defaultRoomId: string;
  onFocusRoom: (roomId: string) => void;
  onShowConstraints: () => void;
}

type Text = (key: AssistantTranslationKey, parameters?: Record<string, string | number>) => string;

function List({ items, className = "assistant-list" }: { items: string[]; className?: string }) {
  return items.length === 0 ? null : <ul className={className}>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>;
}

function ItemSelect({ id, label, value, options, names, t, onChange }: { id: string; label: string; value: string; options: readonly string[]; names: Names; t: Text; onChange: (id: string) => void }) {
  return <label className="lock-endpoint" htmlFor={id}>{label}<select id={id} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t("assistant.choose")}</option>{options.map((option) => <option key={option} value={option}>{names.item(option)}</option>)}</select></label>;
}

function Chip({ pressed, onClick, children, testId }: { pressed: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return <button type="button" className="assistant-chip" aria-pressed={pressed} data-testid={testId} onClick={onClick}>{children}</button>;
}

/** A single-choice preference from an ambiguous text reference: one select per placeholder. */
function AmbiguousPicker({ reference, choices, names, t, onChoose }: { reference: AmbiguousReference; choices: Record<string, string>; names: Names; t: Text; onChoose: (slot: string, value: string) => void }) {
  return (
    <li className="assistant-ambiguous">
      <span>&ldquo;{reference.clause}&rdquo;</span>
      {reference.slots.map((slot) => (
        <label key={slot.slot} className="lock-endpoint">{slot.mention ? `"${slot.mention}"` : t("assistant.second")}
          <select value={choices[slot.slot] ?? ""} onChange={(event) => onChoose(slot.slot, event.target.value)}>
            <option value="">{t("confirm.leaveOut")}</option>
            {slot.candidates.map((candidate) => <option key={candidate} value={candidate}>{slot.slot === "doorId" ? names.door(candidate) : names.item(candidate)}</option>)}
          </select>
        </label>
      ))}
    </li>
  );
}

const conflictMessage = (conflict: Conflict): Message => conflict.code === "closer-vs-lock"
  ? { key: "conflict.closer-vs-lock", params: { first: { item: conflict.itemIds[0] }, second: { item: conflict.itemIds[1] }, minimum: { cm: conflict.lock!.minimum }, actual: { cm: conflict.lock!.actual } } }
  : conflict.code === "pair-direction" ? { key: "conflict.pair-direction", params: { first: { item: conflict.itemIds[0] }, second: { item: conflict.itemIds[1] } } }
  : { key: `conflict.${conflict.code}`, params: { item: { item: conflict.itemIds[0] } } };

function invalidText(t: Text, invalid: readonly InvalidInput[]) {
  return [...new Set(invalid)].map((code) => t(`invalid.${code}`));
}

function RequestForm({ editor, flat, language, defaultRoomId, names, t, onStart }: { editor: EditorState; flat: Flat; language: Language; defaultRoomId: string; names: Names; t: Text; onStart: (request: Parameters<DesignAssistant["start"]>[0], text: string) => void }) {
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [changeLittle, setChangeLittle] = useState(false);
  const [openZone, setOpenZone] = useState(false);
  const [zoneKey, setZoneKey] = useState("");
  const [depth, setDepth] = useState<ZoneDepth>(90);
  const [closer, setCloser] = useState<[string, string] | null>(null);
  const [farther, setFarther] = useState<[string, string] | null>(null);
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const room = flat.rooms.some((entry) => entry.id === roomId) ? roomId : defaultRoomId;
  const { flat: editorFlat, current, locks } = editor;
  const context = useMemo(() => getLayoutContext({ flat: editorFlat, current, locks }, room), [editorFlat, current, locks, room]);
  const items = context?.roomItems ?? [];
  const ids = items.map((item) => item.id);
  const zoneOptions = [...(context?.doors ?? []).map((door) => ({ key: `door:${door.id}`, label: assistantText(language, "zone.option.door", { door: door.name[language] }) })), ...items.map((item) => ({ key: `item:${item.id}`, label: assistantText(language, "zone.option.itemFront", { item: item.name[language] }) }))];
  const zone: ZoneRef | null = !openZone ? null : zoneKey.startsWith("door:") ? { kind: "door", doorId: zoneKey.slice(5), depth } : zoneKey.startsWith("item:") ? { kind: "item-front", itemId: zoneKey.slice(5), depth } : { kind: "door", doorId: "", depth };
  const pairDefault = (): [string, string] => [ids[0] ?? "", ids[1] ?? ""];
  const pairSelects = (prefix: string, pair: [string, string], set: (pair: [string, string]) => void) => <div className="assistant-pair">
    <ItemSelect id={`${prefix}-first`} label={t("assistant.first")} value={pair[0]} options={ids} names={names} t={t} onChange={(value) => set([value, pair[1]])} />
    <ItemSelect id={`${prefix}-second`} label={t("assistant.second")} value={pair[1]} options={ids} names={names} t={t} onChange={(value) => set([pair[0], value])} />
  </div>;
  const keepList = Object.entries(keep).filter(([id]) => ids.includes(id)).map(([itemId, allowRotation]) => ({ itemId, allowRotation }));
  return (
    <form className="assistant-step" noValidate data-testid="assistant-request" onSubmit={(event) => { event.preventDefault(); onStart({ roomId: room, changeLittle, openZone: zone, closer, farther, keep: keepList }, text); }}>
      <label className="lock-endpoint" htmlFor="assistant-room">{t("assistant.room")}<select id="assistant-room" value={room} onChange={(event) => { setRoomId(event.target.value); setZoneKey(""); setCloser(null); setFarther(null); setKeep({}); }}>{flat.rooms.map((entry) => <option key={entry.id} value={entry.id}>{entry.name[language]}</option>)}</select></label>
      <p className="constraint-note">{items.length > 0 ? t("assistant.roomItems", { count: items.length }) : t("assistant.noItems")}</p>
      <fieldset className="assistant-fieldset" disabled={items.length === 0}>
        <legend className="small-heading">{t("assistant.goals")}</legend>
        <div className="assistant-chips">
          <Chip pressed={changeLittle} testId="goal-change-little" onClick={() => setChangeLittle(!changeLittle)}>{t("assistant.goal.changeLittle")}</Chip>
          <Chip pressed={openZone} testId="goal-open-zone" onClick={() => setOpenZone(!openZone)}>{t("assistant.goal.openZone")}</Chip>
          <Chip pressed={closer !== null} testId="goal-closer" onClick={() => setCloser(closer ? null : pairDefault())}>{t("assistant.goal.closer")}</Chip>
          <Chip pressed={farther !== null} testId="goal-farther" onClick={() => setFarther(farther ? null : pairDefault())}>{t("assistant.goal.farther")}</Chip>
        </div>
        <p className="constraint-note">{t("assistant.goalsNote")}</p>
        {openZone && <div className="assistant-pair">
          <label className="lock-endpoint" htmlFor="assistant-zone">{t("assistant.zone")}<select id="assistant-zone" value={zoneKey} onChange={(event) => setZoneKey(event.target.value)}><option value="">{t("assistant.choose")}</option>{zoneOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
          <label className="lock-endpoint" htmlFor="assistant-depth">{t("assistant.zoneDepth")}<select id="assistant-depth" value={depth} onChange={(event) => setDepth(Number(event.target.value) as ZoneDepth)}>{ZONE_DEPTHS.map((value) => <option key={value} value={value}>{formatCm(value, language)} cm</option>)}</select></label>
          <p className="constraint-note">{t("assistant.zoneDepthNote")}</p>
        </div>}
        {closer && <>{<h4 className="small-heading">{t("assistant.goal.closer")}</h4>}{pairSelects("closer", closer, setCloser)}</>}
        {farther && <>{<h4 className="small-heading">{t("assistant.goal.farther")}</h4>}{pairSelects("farther", farther, setFarther)}</>}
      </fieldset>
      <fieldset className="assistant-fieldset" disabled={items.length === 0}>
        <legend className="small-heading">{t("assistant.keep")}</legend>
        <ul className="assistant-keep-list">{items.map((item) => <li key={item.id}>
          <label><input type="checkbox" checked={item.id in keep} onChange={() => setKeep((previous) => { const next = { ...previous }; if (item.id in next) delete next[item.id]; else next[item.id] = false; return next; })} />{item.name[language]}</label>
          {item.id in keep && <label className="assistant-turn"><input type="checkbox" checked={keep[item.id]} onChange={() => setKeep((previous) => ({ ...previous, [item.id]: !previous[item.id] }))} />{t("assistant.allowTurn")}</label>}
        </li>)}</ul>
        <p className="constraint-note">{t("assistant.keepNote")}</p>
      </fieldset>
      <label className="lock-endpoint assistant-text" htmlFor="assistant-text">{t("assistant.text")}<textarea id="assistant-text" rows={3} value={text} placeholder={t("assistant.placeholder")} onChange={(event) => setText(event.target.value)} /></label>
      <p className="constraint-note">{t("assistant.textNote")}</p>
      <button type="submit" className="primary-button" disabled={items.length === 0} data-testid="assistant-review"><Check size={17} aria-hidden="true" />{t("assistant.review")}</button>
    </form>
  );
}

function ConfirmStep({ session, context, fresh, names, t, fmt, onConfirm, onBack }: { session: DesignSession; context: LayoutContext; fresh: boolean; names: Names; t: Text; fmt: (message: Message) => string; onConfirm: (preferences: PreferenceEntry[]) => void; onBack: () => void }) {
  const pending = session.pending!;
  const interpretation = pending.interpretation;
  const [included, setIncluded] = useState<boolean[]>(() => interpretation.textPreferences.map(() => true));
  const [carried, setCarried] = useState<boolean[]>(() => pending.carried.map(() => true));
  const [choices, setChoices] = useState<Record<string, Record<string, string>>>({});
  const resolved = interpretation.ambiguous.flatMap((reference) => {
    const preference = resolveAmbiguous(reference, choices[reference.id] ?? {});
    return preference ? [preference] : [];
  });
  const final: PreferenceEntry[] = [
    ...interpretation.preferences.map((preference) => entry(preference, "control", 0)),
    ...pending.carried.filter((_, index) => carried[index]),
    ...interpretation.textPreferences.filter((_, index) => included[index]).map((item) => entry(item.preference, "text", 0)),
    ...resolved.map((preference) => entry(preference, "text", 0)),
  ];
  const preferences = final.map((item) => item.preference);
  const conflicts = detectConflicts(preferences, context.furniture, context.locks);
  const warnings = detectWarnings(preferences, context);
  const invalid = [...interpretation.invalid.filter((code) => code !== "no-goal"), ...(preferences.some(isGoal) ? [] : ["no-goal" as const])];
  const kept = preferences.flatMap((preference) => preference.type === "keep-in-place" ? [fmt({ key: preference.allowRotation ? "confirm.preserved.keptTurn" : "confirm.preserved.kept", params: { item: { item: preference.itemId } } })] : []);
  const preserved = [...kept, ...context.rotationOnly.map((id) => fmt({ key: "confirm.preserved.locked", params: { item: { item: id } } })), ...context.excluded.map((item) => fmt({ key: "confirm.preserved.excluded", params: { item: { item: item.id } } }))];
  const roomIssues = context.baselineIssues.filter((issue) => issueItemIds(issue).some((id) => context.roomItems.some((item) => item.id === id))).length;
  const sections: [AssistantTranslationKey, string[]][] = [
    ["confirm.unsupported", interpretation.unsupported.map((item) => t("unsupported.line", { clause: item.clause, topic: t(`topic.${item.topic}`) }))],
    ["confirm.unresolved", interpretation.unresolved.map((item) => t(`unresolved.${item.topic}`, { clause: item.clause }))],
    ["confirm.unrecognised", interpretation.unrecognised.map((clause) => `“${clause}”`)],
  ];
  return (
    <section className="assistant-step" aria-labelledby="assistant-confirm-title" data-testid="assistant-confirm">
      <h3 id="assistant-confirm-title">{t("confirm.title")}</h3>
      {interpretation.preferences.length > 0 && <><h4 className="small-heading">{t("confirm.confirmed")}</h4><List items={interpretation.preferences.map((preference) => fmt(preferenceMessage(preference)))} /></>}
      {pending.carried.length > 0 && <><h4 className="small-heading">{t("confirm.carried")}</h4><ul className="assistant-checks">{pending.carried.map((item, index) => <li key={item.key}><label><input type="checkbox" checked={carried[index]} onChange={() => setCarried(carried.map((value, other) => other === index ? !value : value))} />{fmt(preferenceMessage(item.preference))}</label></li>)}</ul></>}
      {pending.dropped.length > 0 && <p className="constraint-note">{t("confirm.dropped", { count: pending.dropped.length })}</p>}
      {interpretation.textPreferences.length > 0 && <><h4 className="small-heading">{t("confirm.fromText")}</h4><ul className="assistant-checks">{interpretation.textPreferences.map((item, index) => <li key={`${index}-${item.clause}`}><label><input type="checkbox" checked={included[index]} onChange={() => setIncluded(included.map((value, other) => other === index ? !value : value))} />{fmt(preferenceMessage(item.preference))}<span className="assistant-clause">“{item.clause}”</span></label></li>)}</ul></>}
      {interpretation.ambiguous.length > 0 && <><h4 className="small-heading">{t("confirm.ambiguous")}</h4><ul className="assistant-checks">{interpretation.ambiguous.map((reference) => <AmbiguousPicker key={reference.id} reference={reference} choices={choices[reference.id] ?? {}} names={names} t={t} onChoose={(slot, value) => setChoices((previous) => ({ ...previous, [reference.id]: { ...previous[reference.id], [slot]: value } }))} />)}</ul></>}
      <h4 className="small-heading">{t("confirm.preserved")}</h4>
      <List items={preserved.length > 0 ? preserved : [t("confirm.preserved.none")]} />
      <h4 className="small-heading">{t("confirm.assumptions")}</h4>
      <List items={interpretation.assumptions.map((code) => t(`assumption.${code}`))} />
      {sections.map(([key, lines]) => lines.length > 0 && <div key={key}><h4 className="small-heading">{t(key)}</h4><List items={lines} /></div>)}
      {roomIssues > 0 && <p className="constraint-note">{t("confirm.baselineIssues", { count: roomIssues })}</p>}
      {warnings.length > 0 && <><h4 className="small-heading">{t("confirm.warnings")}</h4><List items={warnings.map((warning) => warning.code === "pair-fixed" ? fmt({ key: "warning.pair-fixed", params: { first: { item: warning.itemIds[0] }, second: { item: warning.itemIds[1] } } }) : fmt({ key: warning.reason === "locked" ? "warning.zone-locked" : "warning.zone-kept", params: { item: { item: warning.itemIds[0] } } }))} /></>}
      {conflicts.length > 0 && <div className="assistant-conflicts" role="status"><h4 className="small-heading">{t("confirm.conflicts")}</h4><List items={conflicts.map((conflict) => fmt(conflictMessage(conflict)))} /><p className="constraint-note">{t("confirm.conflictHint")}</p></div>}
      {invalid.length > 0 && <List className="assistant-list field-error" items={invalidText(t, invalid)} />}
      <div className="assistant-actions">
        <button type="button" className="primary-button" data-testid="assistant-generate" disabled={!fresh || invalid.length > 0 || conflicts.length > 0} onClick={() => onConfirm(final)}><Lightbulb size={17} aria-hidden="true" />{t("confirm.generate")}</button>
        {session.proposals.length === 0 && session.feedbackHistory.length <= 1 && <button type="button" className="secondary-button" onClick={onBack}>{t("confirm.back")}</button>}
      </div>
    </section>
  );
}

function ProposalView({ proposal, editor, assistant, fresh, t, fmt, names }: { proposal: ProposalRecord; editor: EditorState; assistant: DesignAssistant; fresh: boolean; t: Text; fmt: (message: Message) => string; names: Names }) {
  const goals = proposal.metrics.filter((metric) => metric.kind === "zone" || metric.kind === "pair");
  const preferences = assistant.session?.preferences ?? [];
  const goalLine = (metric: ProposalRecord["metrics"][number]) => {
    const preference = preferences.find((item) => item.key === metric.key)?.preference;
    const outcome = metric.outcome ? ` · ${t(`outcome.${metric.outcome}`)}` : "";
    if (metric.kind === "zone" && preference?.type === "open-zone") return `${fmt({ key: "metric.zone", params: { zone: { zone: preference.zone }, before: { m2: metric.before }, after: { m2: metric.after } } })}${outcome}`;
    if (preference?.type === "pair") return `${fmt({ key: "metric.pair", params: { first: { item: preference.firstId }, second: { item: preference.secondId }, before: { cm: metric.before }, after: { cm: metric.after } } })}${outcome}`;
    return `${metric.key}${outcome}`;
  };
  return (
    <section className="assistant-step" aria-labelledby="assistant-proposal-title" data-testid="assistant-proposal" data-version={proposal.version}>
      <h3 id="assistant-proposal-title">{t("proposal.title", { version: proposal.version })}</h3>
      <p className="assistant-badge">{t("proposal.badge")}</p>
      <div className="segmented assistant-view-toggle" role="group" aria-label={t("proposal.view")}>
        <button type="button" aria-pressed={assistant.previewMode === "current" || editor.view !== "after"} onClick={() => assistant.setPreviewMode("current")}>{t("proposal.current")}</button>
        <button type="button" aria-pressed={assistant.previewMode === "proposed" && editor.view === "after"} disabled={!fresh || editor.view !== "after"} data-testid="assistant-show-proposed" onClick={() => assistant.setPreviewMode("proposed")}>{t("proposal.proposed")}</button>
      </div>
      {editor.view !== "after" && <p className="constraint-note">{t("proposal.previewOff")}</p>}
      <h4 className="small-heading">{t("proposal.changes")}</h4>
      <ul className="assistant-list" data-testid="assistant-changes">{proposal.changes.map((change) => <li key={change.id}><strong>{names.item(change.id)}</strong>: {[change.displacement > 0.5 ? fmt({ key: "proposal.moved", params: { distance: { cm: change.displacement } } }) : null, change.rotation > 0.5 ? fmt({ key: "proposal.turned", params: { angle: { deg: change.rotation } } }) : null].filter(Boolean).join(" · ")}</li>)}</ul>
      <h4 className="small-heading">{t("proposal.goals")}</h4>
      <List items={goals.map(goalLine)} />
      <h4 className="small-heading">{t("proposal.why")}</h4>
      <List items={proposal.reasons.flatMap((reason) => reason.messages.map(fmt))} />
      <h4 className="small-heading">{t("proposal.tradeoffs")}</h4>
      <List items={proposal.tradeOffs.map(fmt)} />
      <h4 className="small-heading">{t("proposal.checks")}</h4>
      <List items={proposal.checks.map(fmt)} />
      <h4 className="small-heading">{t("proposal.unverified")}</h4>
      <List items={proposal.unverified.map(fmt)} />
      <h4 className="small-heading">{t("proposal.ranking")}</h4>
      <List items={proposal.ranking.map(fmt)} />
      <div className="assistant-actions">
        <button type="button" className="primary-button" data-testid="assistant-accept" disabled={!fresh} onClick={assistant.accept}><Check size={17} aria-hidden="true" />{t("proposal.accept")}</button>
        <button type="button" className="secondary-button" data-testid="assistant-reject" disabled={!fresh} onClick={() => assistant.dispatch({ type: "reject-start" })}><ThumbsDown size={17} aria-hidden="true" />{t("proposal.reject")}</button>
        <button type="button" className="secondary-button" data-testid="assistant-discard" onClick={() => assistant.dispatch({ type: "discard", proposalId: proposal.id })}><Ban size={17} aria-hidden="true" />{t("proposal.discard")}</button>
      </div>
    </section>
  );
}

const REASON_CODES: readonly RejectionReasonCode[] = ["should-not-move", "too-many-changes", "dislike-position", "dislike-orientation", "closer", "farther", "keep-here", "other"];

function RejectForm({ proposal, session, context, assistant, fresh, t, fmt, names }: { proposal: ProposalRecord; session: DesignSession; context: LayoutContext; assistant: DesignAssistant; fresh: boolean; t: Text; fmt: (message: Message) => string; names: Names }) {
  const roomIds = context.roomItems.map((item) => item.id);
  const moved = proposal.changes.filter((change) => change.displacement > 0.5).map((change) => change.id);
  const changed = proposal.changedIds;
  const [codes, setCodes] = useState<RejectionReasonCode[]>([]);
  const [items, setItems] = useState<Record<string, [string, string]>>({});
  const [at, setAt] = useState<"original" | "proposed">("proposed");
  const [text, setText] = useState("");
  const [choices, setChoices] = useState<Record<string, Record<string, string>>>({});
  const [decisions, setDecisions] = useState<Record<string, "new" | "earlier">>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const optionsFor = (code: RejectionReasonCode) => code === "dislike-position" ? moved : code === "dislike-orientation" || code === "keep-here" ? changed : roomIds;
  const pick = (code: RejectionReasonCode): [string, string] => items[code] ?? [optionsFor(code)[0] ?? "", code === "closer" || code === "farther" ? roomIds.find((id) => id !== (optionsFor(code)[0] ?? "")) ?? "" : ""];
  const reasons: RejectionReason[] = codes.map((code) => {
    const [itemId, secondId] = pick(code);
    return code === "too-many-changes" || code === "other" ? { code } : code === "closer" || code === "farther" ? { code, itemId, secondId } : code === "keep-here" ? { code, itemId, at } : { code, itemId };
  });
  const feedback = interpretFeedback(reasons, text, proposal, context);
  const resolved = feedback.ambiguous.flatMap((reference) => {
    const preference = resolveAmbiguous(reference, choices[reference.id] ?? {});
    return preference ? [preference] : [];
  });
  // Needs read from the text count only while ticked; the chips' needs are explicit already.
  const textKey = (item: { clause: string; preference: Preference }, index: number) => `${index}:${item.clause}:${JSON.stringify(item.preference)}`;
  const fromText = feedback.textPreferences.filter((item, index) => !excluded.includes(textKey(item, index))).map((item) => item.preference);
  const incoming: Preference[] = [...feedback.preferences, ...fromText, ...resolved];
  const earlier = session.preferences;
  const all = [...earlier.map((item) => item.preference), ...incoming];
  const conflicts = detectConflicts(all, context.furniture, context.locks).filter((conflict) => conflict.indices.some((index) => index >= earlier.length));
  const conflictId = (conflict: Conflict) => `${conflict.code}:${conflict.indices.join("-")}`;
  const undecided = conflicts.filter((conflict) => conflict.code === "closer-vs-lock" || conflict.indices.every((index) => index >= earlier.length) || !decisions[conflictId(conflict)]);
  const dropped = new Set<number>();
  const replaced: string[] = [];
  for (const conflict of conflicts) {
    const decision = decisions[conflictId(conflict)];
    const earlierIndex = conflict.indices.find((index) => index < earlier.length);
    const newIndex = conflict.indices.find((index) => index >= earlier.length);
    if (earlierIndex === undefined || newIndex === undefined || !decision) continue;
    if (decision === "earlier") dropped.add(newIndex - earlier.length);
    else replaced.push(earlier[earlierIndex].key);
  }
  const added = incoming.filter((_, index) => !dropped.has(index)).map((preference) => entry(preference, "feedback", session.round));
  const toggle = (code: RejectionReasonCode) => setCodes(codes.includes(code) ? codes.filter((entry) => entry !== code) : [...codes, code]);
  const setPair = (code: RejectionReasonCode, value: [string, string]) => setItems({ ...items, [code]: value });
  const blocked = feedback.invalid.length > 0 || undecided.length > 0 || !fresh;
  return (
    <section className="assistant-step" aria-labelledby="assistant-reject-title" data-testid="assistant-reject-form">
      <h3 id="assistant-reject-title">{t("reject.title")}</h3>
      <h4 className="small-heading">{t("reject.reasons")}</h4>
      <div className="assistant-chips">{REASON_CODES.map((code) => <Chip key={code} pressed={codes.includes(code)} testId={`chip-${code}`} onClick={() => toggle(code)}>{t(`chip.${code}`)}</Chip>)}</div>
      {codes.filter((code) => code !== "too-many-changes" && code !== "other").map((code) => {
        const [first, second] = pick(code);
        return (
          <div key={code} className="assistant-reason-detail">
            <strong>{t(`chip.${code}`)}</strong>
            {code === "closer" || code === "farther"
              ? <div className="assistant-pair"><ItemSelect id={`reason-${code}-first`} label={t("assistant.first")} value={first} options={roomIds} names={names} t={t} onChange={(value) => setPair(code, [value, second])} /><ItemSelect id={`reason-${code}-second`} label={t("assistant.second")} value={second} options={roomIds} names={names} t={t} onChange={(value) => setPair(code, [first, value])} /></div>
              : <ItemSelect id={`reason-${code}-item`} label={t("reject.item")} value={first} options={optionsFor(code)} names={names} t={t} onChange={(value) => setPair(code, [value, ""])} />}
            {code === "keep-here" && <label className="lock-endpoint" htmlFor="reason-keep-at">{t("reject.at")}<select id="reason-keep-at" value={at} onChange={(event) => setAt(event.target.value as "original" | "proposed")}><option value="proposed">{t("reject.at.proposed")}</option><option value="original">{t("reject.at.original")}</option></select></label>}
            {code === "should-not-move" && <p className="constraint-note">{t("reject.shouldNotMoveNote")}</p>}
          </div>
        );
      })}
      <label className="lock-endpoint assistant-text" htmlFor="assistant-feedback-text">{t("reject.text")}<textarea id="assistant-feedback-text" rows={3} value={text} onChange={(event) => setText(event.target.value)} /></label>
      {codes.includes("other") && <p className="constraint-note">{t("reject.textRequired")}</p>}
      <div className="assistant-interpretation" role="status">
        <h4 className="small-heading">{t("reject.interpretation")}</h4>
        {added.length > 0 ? <><p className="constraint-note">{t("reject.newNeeds")}</p><List items={added.map((item) => fmt(preferenceMessage(item.preference)))} /></> : <p className="constraint-note">{t("reject.noNew")}</p>}
        {feedback.textPreferences.length > 0 && <><p className="constraint-note">{t("confirm.fromText")}</p><ul className="assistant-checks">{feedback.textPreferences.map((item, index) => {
          const key = textKey(item, index);
          return <li key={key}><label><input type="checkbox" checked={!excluded.includes(key)} onChange={() => setExcluded(excluded.includes(key) ? excluded.filter((entry) => entry !== key) : [...excluded, key])} />{fmt(preferenceMessage(item.preference))}<span className="assistant-clause">“{item.clause}”</span></label></li>;
        })}</ul></>}
        {feedback.ambiguous.length > 0 && <><p className="constraint-note">{t("confirm.ambiguous")}</p><ul className="assistant-checks">{feedback.ambiguous.map((reference) => <AmbiguousPicker key={reference.id} reference={reference} choices={choices[reference.id] ?? {}} names={names} t={t} onChoose={(slot, value) => setChoices((previous) => ({ ...previous, [reference.id]: { ...previous[reference.id], [slot]: value } }))} />)}</ul></>}
        <List items={[...feedback.unsupported.map((item) => t("unsupported.line", { clause: item.clause, topic: t(`topic.${item.topic}`) })), ...feedback.unresolved.map((item) => t(`unresolved.${item.topic}`, { clause: item.clause })), ...feedback.unrecognised.map((clause) => `${t("confirm.unrecognised")}: “${clause}”`)]} />
        {conflicts.map((conflict) => {
          const earlierIndex = conflict.indices.find((index) => index < earlier.length);
          return (
            <div key={conflictId(conflict)} className="assistant-conflicts">
              <p>{earlierIndex !== undefined ? `${t("reject.conflictEarlier")} ${fmt(preferenceMessage(earlier[earlierIndex].preference))}. ` : ""}{fmt(conflictMessage(conflict))}</p>
              {earlierIndex !== undefined && conflict.code !== "closer-vs-lock" && <div className="segmented" role="group" aria-label={t("confirm.conflicts")}>
                <button type="button" aria-pressed={decisions[conflictId(conflict)] === "new"} onClick={() => setDecisions({ ...decisions, [conflictId(conflict)]: "new" })}>{t("conflict.useNew")}</button>
                <button type="button" aria-pressed={decisions[conflictId(conflict)] === "earlier"} onClick={() => setDecisions({ ...decisions, [conflictId(conflict)]: "earlier" })}>{t("conflict.keepEarlier")}</button>
              </div>}
            </div>
          );
        })}
        <p className="constraint-note">{t("reject.kept")}</p>
      </div>
      {feedback.invalid.length > 0 && <List className="assistant-list field-error" items={invalidText(t, feedback.invalid)} />}
      <div className="assistant-actions">
        <button type="button" className="primary-button" data-testid="assistant-regenerate" disabled={blocked} onClick={() => assistant.reject({ proposalId: proposal.id, text, reasons, added, replaced, unsupported: feedback.unsupported, unrecognised: feedback.unrecognised })}><RotateCcw size={17} aria-hidden="true" />{t("reject.generate")}</button>
        <button type="button" className="secondary-button" onClick={() => assistant.dispatch({ type: "reject-back" })}>{t("reject.back")}</button>
      </div>
    </section>
  );
}

function ResultView({ session, fresh, assistant, t, fmt, language }: { session: DesignSession; fresh: boolean; assistant: DesignAssistant; t: Text; fmt: (message: Message) => string; language: Language }) {
  const outcome = session.outcome;
  if (!outcome) return null;
  const searched = "searched" in outcome ? outcome.searched : null;
  return (
    <section className="assistant-step" data-testid="assistant-result" data-status={outcome.status} role="status">
      {outcome.status === "none" && <>
        <h3>{t("result.none")}</h3>
        <p className="constraint-note">{t("result.noneNote")}</p>
        <h4 className="small-heading">{t("result.blockers")}</h4>
        <List items={outcome.blockers.map(fmt)} />
        <h4 className="small-heading">{t("result.suggestions")}</h4>
        <List items={outcome.suggestions.map(fmt)} />
      </>}
      {outcome.status === "baseline-meets-goals" && <h3>{t("result.baselineMeets")}</h3>}
      {outcome.status === "timed-out" && <h3>{t("result.timedOut")}</h3>}
      {outcome.status === "cancelled" && <h3>{t("result.cancelled")}</h3>}
      {outcome.status === "error" && <h3>{t("result.error", { message: outcome.message })}</h3>}
      {searched && <p className="constraint-note">{t("result.searched", { moves: searched.movesTried, items: searched.items, combinations: searched.combinationsTried, seconds: formatCm(Math.round(searched.elapsedMs / 100) / 10, language) })}</p>}
      <div className="assistant-actions"><button type="button" className="primary-button" disabled={!fresh} onClick={assistant.generate}><Lightbulb size={17} aria-hidden="true" />{t("result.again")}</button></div>
    </section>
  );
}

/**
 * The design assistant tab: a request, its rule-based interpretation for confirmation, heuristic
 * proposals with grounded reasons, rejection with reasons, and accept/undo. Every round is started by
 * the user; nothing here edits the layout except "Accept and apply" and "Undo this application".
 */
export function AssistantPanel({ assistant, editor, flat, language, defaultRoomId, onFocusRoom, onShowConstraints }: PanelProps) {
  const t: Text = (key, parameters) => assistantText(language, key, parameters);
  const session = assistant.session;
  const furniture = session ? [...editor.current.furniture, ...session.baseline.furniture.filter((item) => !editor.current.furniture.some((entry) => entry.id === item.id))] : editor.current.furniture;
  const names = namesFor(flat, furniture, language);
  const fmt = (message: Message) => formatMessage(message, language, names);
  const freshness = assistant.freshness;
  const fresh = freshness === "fresh";
  const { flat: editorFlat, current, locks } = editor;
  const context = useMemo(() => session ? getLayoutContext({ flat: editorFlat, current, locks }, session.roomId, session) : null, [editorFlat, current, locks, session]);
  const proposal = assistant.proposal;
  const busy = session?.phase === "generating";
  return (
    <section className="assistant-panel" aria-labelledby="assistant-title" data-testid="assistant-panel" data-phase={session?.phase ?? "request"} data-freshness={freshness ?? ""}>
      <h2 id="assistant-title">{t("assistant.title")}</h2>
      <p className="constraint-note">{t("assistant.intro")}</p>
      <p className="assistant-mode" data-testid="assistant-mode">{t("assistant.mode")}</p>
      {!session && <RequestForm editor={editor} flat={flat} language={language} defaultRoomId={defaultRoomId} names={names} t={t} onStart={(request, text) => { assistant.start(request, text); onFocusRoom(request.roomId); }} />}
      {session && freshness === "stale" && <div className="assistant-stale" role="alert" data-testid="assistant-stale"><h3>{t("stale.title")}</h3><p>{t("stale.body")}</p><button type="button" className="secondary-button" onClick={() => assistant.restart(defaultRoomId)}><RotateCcw size={17} aria-hidden="true" />{t("stale.restart")}</button></div>}
      {assistant.notice && <p className="field-error" role="status">{assistant.notice.startsWith("apply.") || assistant.notice.startsWith("undo.") ? t(assistant.notice as AssistantTranslationKey) : assistant.notice}</p>}
      {session && context && session.phase === "confirm" && session.pending && <ConfirmStep key={`${session.id}-${session.startRevision}-${session.feedbackHistory.length}`} session={session} context={context} fresh={fresh} names={names} t={t} fmt={fmt} onConfirm={assistant.confirm} onBack={() => assistant.dispatch({ type: "edit-request" })} />}
      {session && session.phase === "generating" && <section className="assistant-step" role="status" data-testid="assistant-generating"><h3><LoaderCircle className="loading-icon" size={18} aria-hidden="true" /> {t("generating.title")}</h3><p className="constraint-note">{t("generating.note")}</p><div className="assistant-actions"><button type="button" className="secondary-button" onClick={assistant.cancel}><X size={17} aria-hidden="true" />{t("generating.cancel")}</button></div></section>}
      {session && session.phase === "proposal" && proposal && <ProposalView proposal={proposal} editor={editor} assistant={assistant} fresh={fresh} t={t} fmt={fmt} names={names} />}
      {session && context && session.phase === "reject" && proposal && <RejectForm key={proposal.id} proposal={proposal} session={session} context={context} assistant={assistant} fresh={fresh} t={t} fmt={fmt} names={names} />}
      {session && session.phase === "result" && <ResultView session={session} fresh={fresh} assistant={assistant} t={t} fmt={fmt} language={language} />}
      {session && session.phase === "paused" && <section className="assistant-step" role="status" data-testid="assistant-paused"><p>{t(proposal?.status === "discarded" ? "paused.discarded" : proposal?.status === "rejected" ? "paused.rejected" : "paused.ready")}</p><div className="assistant-actions"><button type="button" className="primary-button" disabled={!fresh || busy} onClick={assistant.generate}><Lightbulb size={17} aria-hidden="true" />{t("paused.generate")}</button></div></section>}
      {session && session.phase === "accepted" && session.applied && <section className="assistant-step" data-testid="assistant-accepted" data-freshness={freshness ?? ""}>
        <h3>{t("accepted.title", { version: session.applied.version })}</h3>
        <h4 className="small-heading">{t("accepted.changes")}</h4>
        <List items={session.applied.changes.map((change) => `${names.item(change.id)}: ${[change.displacement > 0.5 ? fmt({ key: "proposal.moved", params: { distance: { cm: change.displacement } } }) : null, change.rotation > 0.5 ? fmt({ key: "proposal.turned", params: { angle: { deg: change.rotation } } }) : null].filter(Boolean).join(" · ")}`)} />
        {freshness === "undone" && <p role="status">{t("accepted.undone")}</p>}
        {freshness === "edited-after-apply" && <p className="constraint-note" role="status">{t("accepted.edited")}</p>}
        <p className="constraint-note">{t("accepted.note")}</p>
        <div className="assistant-actions">
          <button type="button" className="secondary-button" data-testid="assistant-undo" disabled={freshness !== "applied"} onClick={assistant.undo}><Undo2 size={17} aria-hidden="true" />{t("accepted.undo")}</button>
          <button type="button" className="secondary-button" onClick={assistant.end}>{t("accepted.newSession")}</button>
        </div>
      </section>}
      {session && session.preferences.length > 0 && session.phase !== "confirm" && <section className="assistant-step" aria-labelledby="assistant-needs-title">
        <h3 id="assistant-needs-title" className="small-heading">{t("assistant.needs")}</h3>
        <ul className="assistant-needs">{session.preferences.map((item) => <li key={item.key}><span>{fmt(preferenceMessage(item.preference))} <span className="assistant-clause">{t(`assistant.source.${item.source}`)}</span></span>{session.phase !== "accepted" && <button type="button" className="icon-button destructive" disabled={busy} aria-label={`${t("assistant.remove")}: ${fmt(preferenceMessage(item.preference))}`} title={t("assistant.remove")} onClick={() => assistant.dispatch({ type: "remove-preference", key: item.key })}><X size={16} aria-hidden="true" /></button>}</li>)}</ul>
        {session.locks.distance.length > 0 && <button type="button" className="secondary-button" onClick={onShowConstraints}>{t("assistant.constraints")}</button>}
      </section>}
      {session && <details className="look-disclosure assistant-history">
        <summary>{t("assistant.history")}</summary>
        <List items={[
          ...session.feedbackHistory.map((item) => item.kind === "initial" ? t("history.initial", { text: item.text || t("history.noText") }) : item.kind === "restart" ? t("history.restart") : t("history.rejection", { version: session.proposals.find((entry) => entry.id === item.proposalId)?.version ?? "?", text: [...item.reasons.map((reason) => t(`chip.${reason.code}`)), item.text].filter(Boolean).join(" · ") || t("history.noText") })),
          ...session.proposals.map((entry) => t("history.proposal", { version: entry.version, status: t(`status.${entry.status}`) })),
        ]} />
      </details>}
      {session && <div className="assistant-actions"><button type="button" className="secondary-button" data-testid="assistant-end" onClick={assistant.end}>{t("assistant.end")}</button></div>}
    </section>
  );
}

export function ProposalBanner({ version, language, onShowCurrent }: { version: number; language: Language; onShowCurrent: () => void }) {
  return <div className="proposal-banner" role="status" data-testid="proposal-banner"><span>{assistantText(language, "proposal.banner", { version })}</span><button type="button" className="secondary-button" onClick={onShowCurrent}>{assistantText(language, "proposal.showCurrent")}</button></div>;
}

