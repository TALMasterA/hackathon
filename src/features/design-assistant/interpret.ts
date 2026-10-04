import type { Door, FlatFurniture, FurnitureKind } from "../../types/domain";
import type { LayoutContext } from "./context";
import { isGoal } from "./preferences";
import { INTERPRETATION_MODE, type AmbiguousReference, type AssumptionCode, type Interpretation, type InvalidInput, type Preference, type ProposalRecord, type RejectionReason, type StructuredRequest, type TextPreference, type UnresolvedTopic, type UnsupportedTopic, type ZoneDepth } from "./types";

/**
 * interpretUserNeeds / interpretFeedback: a bounded, rule-based reader for English and Traditional
 * Chinese (including Cantonese). It knows furniture names in the target room and a fixed list of
 * phrases; everything else is returned as unrecognised, unsupported or unresolved rather than guessed.
 */

export const DEFAULT_TEXT_ZONE_DEPTH: ZoneDepth = 90;
/** How far around a disliked proposal position the item is kept away, from half its longer side. */
export const AVOID_RADIUS_RANGE_CM = [30, 60] as const;

const KIND_WORDS: Record<FurnitureKind, readonly string[]> = {
  sofa: ["sofa", "couch", "settee", "梳化", "沙發", "沙发"],
  "coffee-table": ["coffee table", "茶几", "咖啡枱", "咖啡檯"],
  "tv-console": ["tv console", "tv stand", "tv cabinet", "tv unit", "television", "tv", "電視櫃", "電視", "电视柜"],
  "side-table": ["side table", "end table", "bedside table", "nightstand", "邊几", "邊枱", "床頭櫃", "床头柜"],
  "dining-table": ["dining table", "餐枱", "餐桌", "餐檯", "飯枱", "飯檯", "飯桌"],
  chair: ["chairs", "chair", "stool", "椅子", "椅", "凳"],
  bed: ["bed", "床"],
  wardrobe: ["wardrobe", "closet", "衣櫃", "衣柜"],
  desk: ["desk", "書枱", "書檯", "書桌", "书桌"],
  "kitchen-counter": ["kitchen counter", "counter", "廚櫃", "厨柜", "灶台"],
  fridge: ["fridge", "refrigerator", "雪櫃", "冰箱"],
  toilet: ["toilet", "座廁", "馬桶", "坐廁"],
  vanity: ["vanity", "basin", "sink", "洗手盆", "面盆"],
};
/** Words that name any kind of table. */
const TABLE_WORDS = ["table", "枱", "檯", "桌"];
const TABLE_KINDS: readonly FurnitureKind[] = ["coffee-table", "dining-table", "side-table", "desk"];
const PRONOUNS = ["it", "this one", "this item", "佢", "呢件", "這件", "它"];

const any = (patterns: readonly RegExp[], text: string) => patterns.some((pattern) => pattern.test(text));

const CHANGE_LESS = [/\bchange (less|little|as little)\b/, /\bfewer (changes|moves)\b/, /\bas few (changes|moves)\b/, /\bminimal (change|changes|moves)\b/, /\bas little as possible\b/, /\b(don't|do not|dont) change (too )?much\b/, /\bsmall(er)? changes\b/, /\bchange less\b/, /少(啲|些|一點|一啲)?(改動|改|郁|移動)/, /改少(啲|些|一點)/, /(唔好|不要)(改|郁|移)(得)?太多/, /改動(少|小)/, /盡量少/, /盡量唔(改|郁)/];
const KEEP = [/\b(don't|do not|dont|never|shouldn't|should not|must not|mustn't)\s+(move|touch|shift|relocate)\b/, /\bkeep\b.*\b(where it is|where they are|in place|in its place|fixed|still|as it is|as is|put|unchanged)\b/, /\bleave\b.*\b(alone|where|as it is|in place|be)\b/, /\bstays?( put| where)?\b/, /\b(stay|remain)s? (put|fixed|in place)\b/, /唔好(郁|移|搬|動)/, /不要(移動|移|動|搬)/, /不可以(移|動|郁)/, /別(動|移)/, /唔(郁|移|搬)/, /唔應該(郁|移|搬)/, /(保持|維持)(原位|不動|唔郁)/, /固定/, /唔使(郁|移|搬)/, /唔駛(郁|移|搬)/, /(留|放)(喺|在)原位/, /原位/, /不動/];
const CLOSER = [/\b(closer|nearer|next to|beside|near)\b/, /近(啲|一啲|些|一點|點|返)/, /靠近|貼近|埋啲|拉近|近一近/];
const FARTHER = [/\b(farther|further|apart|away from|more distance|more space between|more room between)\b/, /遠(啲|一啲|些|一點|點)/, /分開|離遠|遠離|隔開|拉開|隔遠|擺遠/];
const CLEAR = [/\b(clear|open|free|unblocked|empty|unobstructed|not blocked)\b/, /\b(don't|do not|dont) block\b/, /空曠|空位|空出|暢通|通暢|唔好(擋|阻|塞)|不要(擋|阻|塞)|保持(通|空)|清空|騰空|留空|唔好有(嘢|傢俬)/];
const ENTRANCE = [/\b(entrance|front door|entry|main door|entryway)\b/, /門口|入口|大門|玄關/];
const DOOR = [/\b(door|doorway|doors)\b/, /門/];
const FRONT_OF = [/\bin front of\b/, /\bbefore the\b/, /前面|前邊|前方|前面嘅|前/];
const WALK = [/\b(walk|walking|walkway|circulation|move around|get around|get through|easier to move|more space|more room|spacious|roomy|cramped|crowded|squeezed|pass through|path)\b/, /易行|好行|行得|通道|走動|走路|行路|寬敞|闊落|多啲位|多啲空間|空間|逼|擠/];
const OTHERS_MOVABLE = [/\b(everything else|the rest|others|other (furniture|items|things))\b.*\b(can|may|could)\b/, /其他(傢俬|家具|嘢|東西)?(都)?(可以|得|隨便)/];
const KEEP_HERE = [/\bkeep (it|this|that) here\b/, /\bhere is (good|fine|ok)\b/, /\b(i )?like (this|the|its new) (position|spot|place)\b/, /(放|擺)(喺|在)(呢度|這裡|呢個位)/, /就咁放/, /呢個位(置)?(好|ok|唔錯|幾好)/];
const DISLIKE = [/\b(don't|do not|dont) like\b/, /\bdislike\b/, /\bhate\b/, /\bnot (happy|keen)\b/, /唔鍾意|不喜歡|唔中意|唔好睇/];
const POSITION_WORDS = [/\b(position|place|spot|location|where)\b/, /位置|個位|擺位|位/];
const ORIENTATION_WORDS = [/\b(orientation|direction|facing|faces|angle|rotation|turned|way it faces)\b/, /方向|角度|向|轉/];
const TOO_MANY = [/\btoo many (changes|moves|items)\b/, /\b(changed|moved) too (much|many)\b/, /\btoo much (change|changing|moving)\b/, /改動太多|改得太多|郁太多|改太多|太多改動|郁得太多/];

const UNSUPPORTED: readonly (readonly [UnsupportedTopic, readonly RegExp[]])[] = [
  ["daylight", [/\b(sunlight|daylight|sun|sunny|natural light|window light)\b/, /陽光|日光|採光|自然光|曬/]],
  ["lighting", [/\b(light|lights|lighting|lamp|lamps|bright|brighter|dark|darker|dim)\b/, /燈|光線|光猛|明亮|光/]],
  ["colour", [/\b(colou?rs?|paint|painted)\b/, /顏色|色/]],
  ["material", [/\b(material|materials|wood|wooden|fabric|leather|metal|glass)\b/, /物料|材質|木|皮革/]],
  ["feng-shui", [/\bfeng ?shui\b/, /風水/]],
  ["air", [/\b(air|ventilation|breeze|airflow|aircon|air-con|temperature|cool|cooler|warm|warmer|hot|cold)\b/, /通風|空氣|冷氣|溫度|熱|凍|暖/]],
  ["noise", [/\b(noise|noisy|quiet|quieter|sound)\b/, /嘈|噪音|安靜|靜|聲/]],
  ["style", [/\b(style|stylish|cosy|cozy|modern|beautiful|pretty|nice|nicer|look better|looks better|aesthetic|comfortable|comfort)\b/, /風格|舒服|舒適|靚|好睇|美觀|溫馨|感覺/]],
  ["budget", [/\b(buy|budget|price|cost|cheap|cheaper|expensive)\b/, /買|預算|價錢|價格|便宜|貴/]],
  ["add-remove", [/\b(remove|get rid of|throw away|replace)\b/, /\badd (a|an|another|one|more furniture|new)\b/, /加(一|件|張|個)|多一(件|張|個)|丟|扔|移除|換|唔要|加多/]],
  ["resize", [/\b(bigger|smaller|resize|shrink|larger|wider|narrower|taller)\b/, /大啲|細啲|大一點|小一點|加大|縮細|縮小|放大/]],
  ["other-room", [/\b(to|into) (the|my|another) (bedroom|kitchen|bathroom|living room|room)\b/, /(搬|移)(去|到|入)(睡房|房間|廚房|浴室|客廳|主人房)/]],
];

function normalise(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

/** Splits text into clauses at punctuation, "but" / "但", and "and" before a new instruction. */
export function splitClauses(text: string): string[] {
  return normalise(text)
    .split(/[，。,.;；、!?！？\n]+|\s+but\s+|但係|但是|但|不過|而且|另外|同埋|\s+and\s+(?=(?:keep|don't|do not|dont|leave|move|make|put|bring|change|i |the rest|everything|other))/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

interface Mention {
  text: string;
  start: number;
  end: number;
  ids: string[];
}

const isAscii = (term: string) => /^[\x20-\x7e]+$/.test(term);
const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findTerm(clause: string, term: string): { start: number; end: number }[] {
  const pattern = isAscii(term) ? new RegExp(`\\b${escape(term)}s?\\b`, "g") : new RegExp(escape(term), "g");
  return [...clause.matchAll(pattern)].map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }));
}

/** Furniture named in a clause, in order: an item's own name, a kind word, or a word for any table. */
export function findMentions(clause: string, items: readonly FlatFurniture[]): Mention[] {
  const terms: { term: string; ids: string[] }[] = [];
  for (const item of items) for (const name of [item.name.en, item.name["zh-Hant"]]) terms.push({ term: normalise(name), ids: [item.id] });
  for (const [kind, words] of Object.entries(KIND_WORDS) as [FurnitureKind, readonly string[]][]) {
    const ids = items.filter((item) => item.kind === kind).map((item) => item.id);
    for (const word of words) terms.push({ term: word, ids });
  }
  const tables = items.filter((item) => TABLE_KINDS.includes(item.kind)).map((item) => item.id);
  for (const word of TABLE_WORDS) terms.push({ term: word, ids: tables });
  const found: Mention[] = [];
  for (const { term, ids } of terms.sort((first, second) => second.term.length - first.term.length)) {
    for (const span of findTerm(clause, term)) {
      if (found.some((mention) => span.start < mention.end && mention.start < span.end)) continue;
      found.push({ text: clause.slice(span.start, span.end), ...span, ids });
    }
  }
  return found.sort((first, second) => first.start - second.start);
}

function hasPronoun(clause: string): boolean {
  return PRONOUNS.some((word) => findTerm(clause, word).length > 0);
}

interface TextScope {
  items: readonly FlatFurniture[];
  doors: readonly Door[];
  /** In a rejection round: the proposal's changed items and their shown poses. */
  proposal?: ProposalRecord;
}

interface TextResult {
  textPreferences: TextPreference[];
  ambiguous: AmbiguousReference[];
  unsupported: { clause: string; topic: UnsupportedTopic }[];
  unresolved: { clause: string; topic: UnresolvedTopic }[];
  unrecognised: string[];
  assumptions: AssumptionCode[];
  /** Rejection-only meanings found in the text. */
  tooManyChanges: boolean;
}

export function avoidRadius(item: Pick<FlatFurniture, "width" | "depth">): number {
  return Math.min(AVOID_RADIUS_RANGE_CM[1], Math.max(AVOID_RADIUS_RANGE_CM[0], Math.max(item.width, item.depth) / 2));
}

function parseText(text: string, scope: TextScope): TextResult {
  const result: TextResult = { textPreferences: [], ambiguous: [], unsupported: [], unresolved: [], unrecognised: [], assumptions: [], tooManyChanges: false };
  let ambiguousNumber = 0;
  const addAmbiguous = (clause: string, preference: Preference, slots: AmbiguousReference["slots"], options?: Record<string, Preference>) => result.ambiguous.push({ id: `ambiguous-${++ambiguousNumber}`, clause, preference, slots, ...(options ? { options } : {}) });
  const changed = scope.proposal?.changedIds ?? [];
  for (const clause of splitClauses(text)) {
    let recognised = false;
    const mentions = findMentions(clause, scope.items);
    // A pronoun in feedback refers to the proposal's one changed item, or needs choosing among them.
    if (mentions.length === 0 && scope.proposal && hasPronoun(clause)) mentions.push({ text: "it", start: 0, end: 0, ids: changed });
    const missing = mentions.filter((mention) => mention.ids.length === 0);
    const known = mentions.filter((mention) => mention.ids.length > 0);
    if (missing.length > 0) {
      result.unresolved.push({ clause, topic: "not-in-room" });
      recognised = true;
    }
    const slot = (mention: Mention, name: AmbiguousReference["slots"][number]["slot"]) => ({ slot: name, mention: mention.text, candidates: mention.ids });
    const single = (mention: Mention) => mention.ids.length === 1 ? mention.ids[0] : null;
    for (const [topic, patterns] of UNSUPPORTED) {
      if (!any(patterns, clause)) continue;
      result.unsupported.push({ clause, topic });
      recognised = true;
      break;
    }
    if (any(OTHERS_MOVABLE, clause)) {
      result.assumptions.push("others-movable");
      recognised = true;
    }
    if (scope.proposal && any(TOO_MANY, clause)) {
      result.tooManyChanges = true;
      recognised = true;
    } else if (any(CHANGE_LESS, clause)) {
      result.textPreferences.push({ clause, preference: { type: "minimise-changes" } });
      recognised = true;
    } else if (scope.proposal && any(DISLIKE, clause) && (any(POSITION_WORDS, clause) || any(ORIENTATION_WORDS, clause))) {
      const orientation = any(ORIENTATION_WORDS, clause) && !any([/\b(position|place|spot|location)\b/, /位置|擺位/], clause);
      // A disliked position can only be one an item moved to; a disliked direction one it turned to.
      const relevant = scope.proposal.changes.filter((change) => orientation ? change.rotation > 0.5 : change.displacement > 0.5).map((change) => change.id);
      const target = known[0] ?? { text: "", start: 0, end: 0, ids: relevant };
      const ids = target.ids.filter((id) => relevant.includes(id));
      const make = (itemId: string): Preference | null => {
        const shown = scope.proposal!.changes.find((change) => change.id === itemId);
        const item = scope.items.find((entry) => entry.id === itemId);
        if (!shown || !item) return null;
        return orientation ? { type: "avoid-orientation", itemId, angle: shown.to.orientation } : { type: "avoid-position", itemId, centre: { ...shown.to.position }, radius: avoidRadius(item) };
      };
      if (ids.length === 1) {
        const preference = make(ids[0]);
        if (preference) result.textPreferences.push({ clause, preference });
      } else if (ids.length > 1) {
        const options = Object.fromEntries(ids.flatMap((id) => {
          const preference = make(id);
          return preference ? [[id, preference]] : [];
        }));
        const first = options[ids[0]];
        if (first) addAmbiguous(clause, first, [{ slot: "itemId", mention: target.text, candidates: Object.keys(options) }], options);
      } else result.unresolved.push({ clause, topic: "needs-item" });
      recognised = true;
    } else if (scope.proposal && any(KEEP_HERE, clause)) {
      result.unresolved.push({ clause, topic: "keep-here" });
      recognised = true;
    } else if (any(CLOSER, clause) || any(FARTHER, clause)) {
      const direction = any(FARTHER, clause) && !any([/\b(closer|nearer)\b/, /近(啲|一啲|些|一點|點|返)/], clause) ? "farther" : "closer";
      const [first, second] = known;
      if (!first) result.unresolved.push({ clause, topic: "needs-item" });
      else {
        const preference: Preference = { type: "pair", firstId: single(first) ?? "", secondId: second ? single(second) ?? "" : "", direction };
        const slots: AmbiguousReference["slots"] = [];
        if (!single(first)) slots.push(slot(first, "firstId"));
        if (!second) slots.push({ slot: "secondId", mention: "", candidates: scope.items.map((item) => item.id).filter((id) => !first.ids.includes(id) || first.ids.length > 1) });
        else if (!single(second)) slots.push(slot(second, "secondId"));
        if (slots.length === 0) result.textPreferences.push({ clause, preference });
        else addAmbiguous(clause, preference, slots);
      }
      recognised = true;
    } else if (any(CLEAR, clause) || (any(ENTRANCE, clause) && any(WALK, clause))) {
      if (any(FRONT_OF, clause) && known.length > 0 && !any(ENTRANCE, clause)) {
        const target = known[0];
        const preference: Preference = { type: "open-zone", zone: { kind: "item-front", itemId: single(target) ?? "", depth: DEFAULT_TEXT_ZONE_DEPTH } };
        if (single(target)) result.textPreferences.push({ clause, preference });
        else addAmbiguous(clause, preference, [slot(target, "itemId")]);
        result.assumptions.push("zone-depth-default", "front-zone-follows");
        recognised = true;
      } else if (any(ENTRANCE, clause) || any(DOOR, clause)) {
        const entrances = scope.doors.filter((door) => door.connects.includes("outside"));
        const candidates = any(ENTRANCE, clause) && entrances.length > 0 ? entrances : scope.doors;
        if (candidates.length === 0) result.unresolved.push({ clause, topic: "no-door" });
        else {
          const preference: Preference = { type: "open-zone", zone: { kind: "door", doorId: candidates.length === 1 ? candidates[0].id : "", depth: DEFAULT_TEXT_ZONE_DEPTH } };
          if (candidates.length === 1) result.textPreferences.push({ clause, preference });
          else addAmbiguous(clause, preference, [{ slot: "doorId", mention: clause, candidates: candidates.map((door) => door.id) }]);
          result.assumptions.push("zone-depth-default");
        }
        recognised = true;
      } else if (any(WALK, clause)) {
        result.unresolved.push({ clause, topic: "walking-space" });
        recognised = true;
      }
    } else if (any(KEEP, clause) && known.length > 0) {
      for (const mention of known) {
        const id = single(mention);
        const preference: Preference = { type: "keep-in-place", itemId: id ?? "", allowRotation: false };
        if (id) result.textPreferences.push({ clause, preference });
        else addAmbiguous(clause, preference, [slot(mention, "itemId")]);
      }
      recognised = true;
    } else if (any(WALK, clause)) {
      result.unresolved.push({ clause, topic: "walking-space" });
      recognised = true;
    }
    if (!recognised) result.unrecognised.push(clause);
  }
  return result;
}

/** The structured controls as preferences; they are authoritative and need no confirmation. */
export function structuredPreferences(request: StructuredRequest): { preferences: Preference[]; invalid: InvalidInput[] } {
  const preferences: Preference[] = [];
  const invalid: InvalidInput[] = [];
  if (!request.roomId) invalid.push("no-room");
  for (const keep of request.keep) preferences.push({ type: "keep-in-place", itemId: keep.itemId, allowRotation: keep.allowRotation });
  if (request.changeLittle) preferences.push({ type: "minimise-changes" });
  if (request.openZone) {
    const id = request.openZone.kind === "door" ? request.openZone.doorId : request.openZone.itemId;
    if (id) preferences.push({ type: "open-zone", zone: request.openZone });
    else invalid.push("zone-missing");
  }
  for (const [pair, direction] of [[request.closer, "closer"], [request.farther, "farther"]] as const) {
    if (!pair) continue;
    if (!pair[0] || !pair[1]) invalid.push("pair-incomplete");
    else if (pair[0] === pair[1]) invalid.push("pair-same-item");
    else preferences.push({ type: "pair", firstId: pair[0], secondId: pair[1], direction });
  }
  return { preferences, invalid };
}

/**
 * interpretUserNeeds: structured controls (authoritative) plus what the rule-based reader found in
 * the free text, each text preference waiting for the user's confirmation.
 */
export function interpretUserNeeds(request: StructuredRequest, text: string, context: Pick<LayoutContext, "roomItems" | "doors">): Interpretation {
  const structured = structuredPreferences(request);
  const parsed = parseText(text, { items: context.roomItems, doors: context.doors });
  const assumptions = new Set<AssumptionCode>(["same-room", "rotation-steps", ...parsed.assumptions]);
  if (parsed.textPreferences.length > 0 || parsed.ambiguous.length > 0) assumptions.add("text-confirmation");
  if (request.openZone?.kind === "item-front") assumptions.add("front-zone-follows");
  const invalid = [...structured.invalid];
  const hasGoal = structured.preferences.some(isGoal) || parsed.textPreferences.some((entry) => isGoal(entry.preference)) || parsed.ambiguous.some((entry) => isGoal(entry.preference));
  if (!hasGoal) invalid.push("no-goal");
  return { mode: INTERPRETATION_MODE, preferences: structured.preferences, textPreferences: parsed.textPreferences, ambiguous: parsed.ambiguous, unsupported: parsed.unsupported, unresolved: parsed.unresolved, unrecognised: parsed.unrecognised, assumptions: [...assumptions], invalid };
}

/** Fills an ambiguous reference's placeholders with the user's choices; null until every slot is chosen. */
export function resolveAmbiguous(reference: AmbiguousReference, choices: Record<string, string>): Preference | null {
  if (reference.slots.some((slot) => !choices[slot.slot] || !slot.candidates.includes(choices[slot.slot]))) return null;
  if (reference.options) return reference.options[choices[reference.slots[0].slot]] ?? null;
  const preference = reference.preference;
  if (preference.type === "pair") {
    const resolved = { ...preference, firstId: choices.firstId ?? preference.firstId, secondId: choices.secondId ?? preference.secondId };
    return resolved.firstId && resolved.secondId && resolved.firstId !== resolved.secondId ? resolved : null;
  }
  if (preference.type === "open-zone") {
    return preference.zone.kind === "door" ? { ...preference, zone: { ...preference.zone, doorId: choices.doorId } } : { ...preference, zone: { ...preference.zone, itemId: choices.itemId } };
  }
  if (preference.type === "keep-in-place" || preference.type === "avoid-orientation") return { ...preference, itemId: choices.itemId };
  if (preference.type === "avoid-position") return { ...preference, itemId: choices.itemId };
  return preference;
}

export interface FeedbackInterpretation {
  /** From the reason chips and their pickers. */
  preferences: Preference[];
  /** Found in the feedback text: used only after the user confirms each one. */
  textPreferences: TextPreference[];
  ambiguous: AmbiguousReference[];
  unsupported: { clause: string; topic: UnsupportedTopic }[];
  unresolved: { clause: string; topic: UnresolvedTopic }[];
  unrecognised: string[];
  invalid: InvalidInput[];
}

/**
 * interpretFeedback: a rejection's reason chips (each with its item or pair) and optional text, as
 * preferences for the next round. "Original" means the baseline pose; "proposed" means the pose the
 * rejected draft showed.
 */
export function interpretFeedback(reasons: readonly RejectionReason[], text: string, proposal: ProposalRecord, context: Pick<LayoutContext, "roomItems" | "doors">): FeedbackInterpretation {
  const preferences: Preference[] = [];
  const invalid: InvalidInput[] = [];
  const item = (id?: string) => context.roomItems.find((entry) => entry.id === id);
  const shown = (id?: string) => proposal.changes.find((change) => change.id === id);
  for (const reason of reasons) {
    switch (reason.code) {
      case "should-not-move":
        if (item(reason.itemId)) preferences.push({ type: "keep-in-place", itemId: reason.itemId!, allowRotation: false });
        else invalid.push("pair-incomplete");
        break;
      case "keep-here": {
        const change = shown(reason.itemId);
        if (!item(reason.itemId)) invalid.push("pair-incomplete");
        else if (reason.at === "proposed" && change) preferences.push({ type: "keep-in-place", itemId: reason.itemId!, allowRotation: false, pose: { position: { ...change.to.position }, orientation: change.to.orientation } });
        else preferences.push({ type: "keep-in-place", itemId: reason.itemId!, allowRotation: false });
        break;
      }
      case "too-many-changes":
        preferences.push({ type: "minimise-changes", maxChangedItems: Math.max(1, proposal.changedIds.length - 1) });
        break;
      case "dislike-position": {
        const change = shown(reason.itemId);
        const target = item(reason.itemId);
        if (change && target) preferences.push({ type: "avoid-position", itemId: target.id, centre: { ...change.to.position }, radius: avoidRadius(target) });
        else invalid.push("pair-incomplete");
        break;
      }
      case "dislike-orientation": {
        const change = shown(reason.itemId);
        if (change) preferences.push({ type: "avoid-orientation", itemId: change.id, angle: change.to.orientation });
        else invalid.push("pair-incomplete");
        break;
      }
      case "closer":
      case "farther":
        if (!reason.itemId || !reason.secondId) invalid.push("pair-incomplete");
        else if (reason.itemId === reason.secondId) invalid.push("pair-same-item");
        else preferences.push({ type: "pair", firstId: reason.itemId, secondId: reason.secondId, direction: reason.code });
        break;
      case "other":
        if (text.trim().length === 0) invalid.push("other-needs-text");
        break;
    }
  }
  if (reasons.length === 0 && text.trim().length === 0) invalid.push("no-reason");
  const parsed = parseText(text, { items: context.roomItems, doors: context.doors, proposal });
  const textPreferences = [...parsed.textPreferences];
  if (parsed.tooManyChanges && !preferences.some((preference) => preference.type === "minimise-changes")) textPreferences.unshift({ clause: text.trim(), preference: { type: "minimise-changes", maxChangedItems: Math.max(1, proposal.changedIds.length - 1) } });
  return { preferences, textPreferences, ambiguous: parsed.ambiguous, unsupported: parsed.unsupported, unresolved: parsed.unresolved, unrecognised: parsed.unrecognised, invalid: [...new Set(invalid)] };
}
