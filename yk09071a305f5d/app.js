/* foodlog-YK v1 — 増量を支える食事ログ（既存foodlogの派生・別プロファイル）｜更新: 2026-07-21 */
/* 設計制約：摂取エネルギーは下限のみ扱う（上限の概念を画面に出さない）。未達を責める文言・
   警告色（赤・オレンジ）・体重減少を肯定する表示は実装しない。数値は隠さない。 */
"use strict";

const DATA_KEY = "mealogM:data";
const CFG_KEY = "mealogM:cfg";
const API_KEY_KEY = "mealogM:apikey";
const GH_TOKEN_KEY = "mealogM:ghtoken";
const GIST_ID_KEY = "mealogM:gistid";
const LAST_SYNC_KEY = "mealogM:lastsync";
const PROTECT_KEY = "mealogM:protect";
const GIST_FILE = "foodlog-m-data.json";
const MODEL_ESTIMATE = "claude-haiku-4-5-20251001";

const SLOTS = [["morning", "朝"], ["noon", "昼"], ["snack", "間食"], ["night", "夜"]];
const SLOT_LABEL = Object.fromEntries(SLOTS);
// 区分の代表時刻（設定で変更可）。個別時刻tがない食事はこの時刻として血糖の較正・シミュレーションに使う
const SLOT_TIME_DEFAULT = { morning: "08:00", noon: "12:30", snack: "15:30", night: "19:30" };
const slotTime = (slot) => (cfg().slotTimes || {})[slot] || SLOT_TIME_DEFAULT[slot] || "12:00";
const effTime = (f) => f.t || slotTime(f.slot || "night");
const validHHMM = (s) => typeof s === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim()) ? s.trim() : null;

// ---- 初期辞書：Mの常食。量指定なしの単語入力に既定量で応える（一般的な栄養値） ----
const DICT = [
  { re: /プロテイン/, name: "プロテイン(1杯)", p: 20, c: 3, kcal: 110, fiber: 0, sfiber: 0, satfat: 0.5 },
  { re: /バナナ/, name: "バナナ(1本)", p: 1, c: 25, kcal: 90, fiber: 1.1, sfiber: 0.1, satfat: 0 },
  { re: /黒ごま|黒ゴマ/, name: "黒ゴマ(大さじ1)", p: 1.8, c: 0.8, kcal: 54, fiber: 1.1, sfiber: 0.2, satfat: 0.8 },
  { re: /オートミール/, name: "オートミール(30g)", p: 4, c: 20, kcal: 114, fiber: 2.8, sfiber: 1.5, satfat: 0.3 },
  { re: /きなこ餅|きな粉餅/, name: "きなこ餅(1個)", p: 3, c: 30, kcal: 150, fiber: 0.8, sfiber: 0.1, satfat: 0.2, soy: 1 },
  { re: /きなこ|きな粉/, name: "きなこ(大さじ1)", p: 4, c: 2, kcal: 37, fiber: 1.4, sfiber: 0.2, satfat: 0.4, soy: 1 },
  { re: /蕎麦|そば/, name: "十割蕎麦(1人前)", p: 12, c: 55, kcal: 330, fiber: 4, sfiber: 1, satfat: 0.4 },
  { re: /鶏むね|鶏胸|むね肉/, name: "鶏むね肉(100g)", p: 23, c: 0, kcal: 110, fiber: 0, sfiber: 0, satfat: 0.5 },
  { re: /豆腐/, name: "豆腐(半丁)", p: 10, c: 3, kcal: 110, fiber: 0.6, sfiber: 0.1, satfat: 1.2, soy: 1 },
  { re: /卵かけご飯|卵かけごはん|TKG/, name: "卵かけご飯", p: 10, c: 56, kcal: 320, fiber: 0.5, sfiber: 0, satfat: 1.8 },
  { re: /卵焼き|玉子焼き|だし巻き/, name: "卵焼き(2切れ)", p: 6, c: 2, kcal: 110, fiber: 0, sfiber: 0, satfat: 2 },
  { re: /ゆで卵|茹で卵|卵/, name: "ゆで卵(1個)", p: 6, c: 0.2, kcal: 76, fiber: 0, sfiber: 0, satfat: 1.6 },
  { re: /サバ|さば|鯖/, name: "サバ味噌煮(1切れ)", p: 20, c: 7, kcal: 250, fiber: 0, sfiber: 0, satfat: 2.5, fish: 1 },
  { re: /鮭|さけ|しゃけ|サーモン/, name: "鮭(1切れ)", p: 18, c: 0, kcal: 130, fiber: 0, sfiber: 0, satfat: 1, fish: 1 },
  { re: /白米|ご飯|ごはん/, name: "白米(150g)", p: 4, c: 55, kcal: 234, fiber: 0.5, sfiber: 0, satfat: 0.1 },
  { re: /とろろ|長芋|山芋/, name: "とろろ芋(100g)", p: 2, c: 13, kcal: 65, fiber: 1, sfiber: 0.8, satfat: 0 },
  { re: /黒豆/, name: "黒豆(50g)", p: 8, c: 12, kcal: 110, fiber: 3, sfiber: 1, satfat: 0.3, soy: 1 },
  { re: /小松菜/, name: "小松菜(70g)", p: 1, c: 1.7, kcal: 10, fiber: 1.3, sfiber: 0.3, satfat: 0 },
  { re: /ギリシャヨーグルト|ヨーグルト/, name: "ギリシャヨーグルト(1個)", p: 10, c: 4, kcal: 100, fiber: 0, sfiber: 0, satfat: 2 },
  { re: /豆乳ラテ|ソイラテ/, name: "豆乳ラテ(1杯)", p: 4, c: 8, kcal: 90, fiber: 0.3, sfiber: 0.1, satfat: 0.4, soy: 1 },
  { re: /豆乳/, name: "豆乳(1杯)", p: 7, c: 6, kcal: 110, fiber: 0.4, sfiber: 0.1, satfat: 0.5, soy: 1 },
  { re: /納豆/, name: "納豆(1パック)", p: 8, c: 6, kcal: 100, fiber: 3, sfiber: 1, satfat: 0.7, soy: 1 },
  { re: /ミックスナッツ|ナッツ|アーモンド|くるみ|クルミ/, name: "ミックスナッツ(30g)", p: 6, c: 6, kcal: 170, fiber: 2, sfiber: 0.5, satfat: 2.5, nuts: 1 },
  { re: /和菓子|大福|どら焼き|羊羹|ようかん/, name: "和菓子(1個)", p: 2, c: 30, kcal: 140, fiber: 0.5, sfiber: 0.1, satfat: 0.1 },
  { re: /押し麦|押麦|もち麦/, name: "押し麦(大さじ2)", p: 1, c: 10, kcal: 47, fiber: 1.7, sfiber: 1.2, satfat: 0 },
  { re: /わかめ|めかぶ|もずく|海藻/, name: "海藻(1食分)", p: 0.5, c: 1, kcal: 5, fiber: 1, sfiber: 1, satfat: 0 },
  { re: /生姜紅茶|ジンジャーティー/, name: "生姜紅茶(1杯)", p: 0, c: 0.5, kcal: 2, fiber: 0, sfiber: 0, satfat: 0, ginger: 1 },
  { re: /チューブ生姜|生姜|しょうが|ショウガ/, name: "生姜(小さじ1)", p: 0, c: 0.5, kcal: 2, fiber: 0, sfiber: 0, satfat: 0, ginger: 1 },
];

// ---------- 状態 ----------
let data = {};
let view = "log";
let range = 14; // 振り返りの期間（日）
let cursor = new Date();
let inputText = "";
let slotSel = null, slotSelKey = null; // 区分の手動選択は当日限り（翌日に残留させない）
let busy = false;
let errMsg = "", setMsg = "";
let syncState = "off";
let syncReady = true;
let pushTimer = null;

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtJP = (d) => `${d.getMonth() + 1}/${d.getDate()}（${"日月火水木金土"[d.getDay()]}）`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const emptyDay = () => ({ foods: [], moves: [], fatigue: null, weight: null, fatpct: null });
const getDay = (key) => Object.assign(emptyDay(), data[key] || {});
const apiKey = () => localStorage.getItem(API_KEY_KEY) || "";
const ghToken = () => localStorage.getItem(GH_TOKEN_KEY) || "";
const gistId = () => localStorage.getItem(GIST_ID_KEY) || "";

function cfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; }
}
function saveCfg(patch) {
  localStorage.setItem(CFG_KEY, JSON.stringify(Object.assign(cfg(), patch)));
}

function load() {
  try { const raw = localStorage.getItem(DATA_KEY); if (raw) data = JSON.parse(raw) || {}; } catch (e) {}
}
function save() {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) {}
  schedulePush();
}
function updateDay(key, patch) {
  data[key] = Object.assign(getDay(key), patch, { _m: Date.now() });
  save();
  render();
}

// ---------- 集計 ----------
const sumF = (day, f) => (day.foods || []).reduce((a, x) => a + num(x[f]), 0);
function weekDays(anchorKey) {
  const [y, m, d] = anchorKey.split("-").map(Number);
  const a = new Date(y, m - 1, d);
  const off = (a.getDay() - 1 + 7) % 7; // 月曜始まり
  const days = [];
  for (let i = 0; i <= off; i++) { const t = new Date(y, m - 1, d - off + i); days.push(toKey(t)); }
  return days;
}
function weeklyCounts(anchorKey) {
  const c = { fish: 0, soy: 0, nuts: 0, ginger: 0, pilates: 0, walk: 0 };
  for (const k of weekDays(anchorKey)) {
    const dd = data[k];
    if (!dd) continue;
    const fs = dd.foods || [];
    if (fs.some((f) => f.fish)) c.fish++;
    if (fs.some((f) => f.soy)) c.soy++;
    if (fs.some((f) => f.nuts)) c.nuts++;
    if (fs.some((f) => f.ginger)) c.ginger++;
    const mv = dd.moves || [];
    if (mv.some((m) => m.kind === "pilates")) c.pilates++;
    if (mv.some((m) => m.kind === "walk")) c.walk++;
  }
  return c;
}
function weightAvg7(anchor) {
  let sum = 0, n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor); d.setDate(d.getDate() - i);
    const w = (data[toKey(d)] || {}).weight;
    if (w != null && w !== "" && !isNaN(Number(w))) { sum += Number(w); n++; }
  }
  return n >= 2 ? (sum / n).toFixed(1) : null;
}
function lastTwoWeights(anchorKey) {
  const keys = Object.keys(data).filter((k) => k <= anchorKey && data[k] && data[k].weight != null && data[k].weight !== "").sort();
  const w = keys.slice(-2).map((k) => Number(data[k].weight));
  return w.length === 2 ? w : null;
}

// ---------- 守りの週 ----------
function protect() {
  try { return JSON.parse(localStorage.getItem(PROTECT_KEY)) || {}; } catch (e) { return {}; }
}
function protectActive(todayKey) {
  const p = protect();
  return !!(p.until && todayKey <= p.until);
}
function protectSuggest(todayKey) {
  if (protectActive(todayKey)) return false;
  const p = protect();
  if (p.dismissedUntil && todayKey <= p.dismissedUntil) return false;
  const dated = Object.keys(data).filter((k) => (data[k].foods || []).length);
  if (dated.length < 3) return false; // 使い始めは判定しない
  let hardDays = 0;
  for (let i = 0; i < 3; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dd = data[toKey(d)] || {};
    if (dd.fatigue === "bad") hardDays++;
  }
  return hardDays >= 2; // 判定は本人が申告した疲労度のみ（運動記録の不在では発動させない）
}
function startProtect() {
  const until = new Date(); until.setDate(until.getDate() + 6);
  localStorage.setItem(PROTECT_KEY, JSON.stringify({ until: toKey(until) }));
  render();
}
function endProtect() {
  localStorage.setItem(PROTECT_KEY, JSON.stringify({}));
  render();
}
function dismissProtect() {
  const until = new Date(); until.setDate(until.getDate() + 3);
  localStorage.setItem(PROTECT_KEY, JSON.stringify(Object.assign(protect(), { dismissedUntil: toKey(until) })));
  render();
}

// ---------- 入力（辞書 → AI概算） ----------
function dictMatch(token) {
  for (const e of DICT) if (e.re.test(token)) {
    return { name: e.name, p: e.p, c: e.c, kcal: e.kcal, fiber: e.fiber, sfiber: e.sfiber, satfat: e.satfat,
      fish: e.fish ? 1 : 0, soy: e.soy ? 1 : 0, nuts: e.nuts ? 1 : 0, ginger: e.ginger ? 1 : 0 };
  }
  return null;
}
function currentSlot() {
  if (slotSel && slotSelKey === toKey(new Date())) return slotSel;
  const h = new Date().getHours();
  return h < 11 ? "morning" : h < 16 ? "noon" : "night";
}
async function callApi(body) {
  const key = apiKey();
  if (!key) throw new Error("NO_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("api " + res.status);
  const j = await res.json();
  return (j.content || []).map((c) => c.text || "").join("");
}
async function estimateItems(tokens) {
  const raw = await callApi({
    model: MODEL_ESTIMATE, max_tokens: 1200,
    messages: [{ role: "user", content:
`あなたは栄養士です。次の食品リストについて、一般的な1食分として推定してください。
食品：${tokens.join("、")}
各品目について：p=たんぱく質g(小数1桁), c=糖質g, kcal=エネルギーkcal, fiber=食物繊維g, sfiber=うち水溶性食物繊維g, satfat=飽和脂肪酸g,
fish=魚介なら1, soy=大豆製品なら1, nuts=ナッツ類なら1, ginger=生姜・生姜紅茶なら1（該当しなければ0）。
出力はJSON配列のみ。各要素 {"name":品名,"p":num,"c":num,"kcal":num,"fiber":num,"sfiber":num,"satfat":num,"fish":0or1,"soy":0or1,"nuts":0or1,"ginger":0or1}。
前置き・コードフェンスは不要。`}],
  });
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  return parsed.filter((x) => x && x.name).map((x) => ({
    name: String(x.name), p: num(x.p), c: num(x.c), kcal: num(x.kcal),
    fiber: num(x.fiber), sfiber: num(x.sfiber), satfat: num(x.satfat),
    fish: x.fish ? 1 : 0, soy: x.soy ? 1 : 0, nuts: x.nuts ? 1 : 0, ginger: x.ginger ? 1 : 0,
  }));
}
function parseSegments(t) {
  // 「朝：オートミール、バナナ 昼：蕎麦」の一括入力に対応。区分指定がなければ選択中の区分1つ
  const map = { "朝": "morning", "昼": "noon", "夜": "night", "間食": "snack" };
  const parts = t.split(/(朝|昼|夜|間食)[：:]/);
  if (parts.length === 1) return [{ slot: currentSlot(), text: t }];
  const segs = [];
  if (parts[0].trim()) segs.push({ slot: currentSlot(), text: parts[0] });
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i + 1] && parts[i + 1].trim()) segs.push({ slot: map[parts[i]], text: parts[i + 1] });
  }
  return segs;
}
async function submitText() {
  const t = inputText.trim();
  if (!t || busy) return;
  const segs = parseSegments(t);
  const key = toKey(cursor);
  const ready = [], pending = [];
  for (const s of segs) {
    const tokens = s.text.split(/[、,，・\s　\/]+/).filter(Boolean);
    for (const tok of tokens) {
      const d = dictMatch(tok);
      if (d) ready.push(Object.assign({ slot: s.slot }, d));
      else {
        let pd = pending.find((x) => x.slot === s.slot);
        if (!pd) { pd = { slot: s.slot, tokens: [] }; pending.push(pd); }
        pd.tokens.push(tok);
      }
    }
  }
  if (!pending.length) {
    inputText = ""; errMsg = "";
    updateDay(key, { foods: getDay(key).foods.concat(ready) });
    return;
  }
  if (!apiKey()) { errMsg = "辞書にない食品（" + pending.flatMap((p) => p.tokens).join("・") + "）の概算にはAPIキーが必要です。設定タブから登録できます。"; render(); return; }
  busy = true; errMsg = ""; inputText = ""; render();
  try {
    const estimated = [];
    for (const pd of pending) {
      const items = await estimateItems(pd.tokens);
      estimated.push(...items.map((m) => Object.assign({ slot: pd.slot }, m)));
    }
    updateDay(key, { foods: getDay(key).foods.concat(ready, estimated) });
  } catch (e) {
    errMsg = e.message === "NO_KEY" ? "設定タブでAPIキーを登録してください。" : "概算がうまくいきませんでした。通信を確認して、もう一度どうぞ。";
    if (!inputText) inputText = t; // 失敗時は入力を戻す（打ち直し不要に）
  } finally { busy = false; render(); }
}

// ---------- 描画 ----------
// 今週の食べ物・運動リスト（できた日を数えるだけ・月曜始まり）。記録タブと振り返りで共用
function rhythmCard(guard) {
  const wk = weeklyCounts(toKey(new Date()));
  const rows = [
    ["🐟 魚", wk.fish, 3], ["🫘 大豆", wk.soy, 6], ["🥜 ナッツ", wk.nuts, 6],
    ["🫚 生姜", wk.ginger, 6], ["🧘 ピラティス", wk.pilates, 2], ["🚶 散歩", wk.walk, 5],
  ];
  return `<div class="card rhythmbox">
    ${rows.map(([label, v, t]) => {
      const dots = Array.from({ length: Math.max(guard ? v : t, v) }).map((_, i) =>
        `<span class="rhydot ${i < v ? "fill" : ""}"></span>`).join("");
      return `<div class="rhyrow">
        <span class="rhyname">${label}</span>
        <div class="rhydots">${dots}</div>
        <span class="rhystat mono ${!guard && v >= t ? "met" : ""}">${guard ? `${v}日` : v >= t ? `${v}/${t} ✓` : `${v}/${t}`}</span>
      </div>`;
    }).join("")}
  </div>`;
}
function gaugeRow(icon, label, val, target, unit, praise, addNote, hideTarget) {
  const met = target != null && val >= target;
  const pct = target ? Math.min(val / target, 1) * 100 : 0;
  const color = target == null ? "var(--text)" : met ? "var(--green)" : "var(--blue)";
  return `
    <div class="grow">
      <div class="ghead">
        <span class="gname">${icon} ${label}</span>
        <span class="gnum mono" style="color:${hideTarget ? "var(--text)" : color}">${val % 1 ? val.toFixed(1) : val}</span>
        <span class="gunit mono">${hideTarget || target == null ? unit : `/ ${target} ${unit}`}</span>
      </div>
      ${hideTarget || target == null ? "" : `<div class="hbar"><div class="fill" style="width:${pct}%;background:${color}"></div></div>`}
      ${!hideTarget && met && praise ? `<div class="gnote ok">✓ ${praise}</div>` : ""}
      ${!hideTarget && !met && addNote ? `<div class="gnote info">${addNote}</div>` : ""}
    </div>`;
}

function renderLog() {
  const key = toKey(cursor);
  const day = getDay(key);
  const c = cfg();
  const isToday = toKey(new Date()) === key;
  const guard = protectActive(toKey(new Date())); // 守りの週：目標線と提案を出さない
  const P = Math.round(sumF(day, "p") * 10) / 10;
  const FI = Math.round(sumF(day, "fiber") * 10) / 10;
  const SF = Math.round(sumF(day, "sfiber") * 10) / 10;
  const K = Math.round(sumF(day, "kcal"));
  const SAT = Math.round(sumF(day, "satfat") * 10) / 10;
  const wk = weeklyCounts(key);
  const obs = c.obsEnd && toKey(new Date()) <= c.obsEnd;
  const obsDays = obs ? Math.round((new Date(c.obsEnd) - new Date(toKey(new Date()))) / 86400000) + 1 : 0;

  const hasFood = day.foods.length > 0;
  const kcalNote = hasFood && c.kcalFloor && K < c.kcalFloor
    ? `下限 ${Number(c.kcalFloor).toLocaleString()} まであと ${(c.kcalFloor - K).toLocaleString()} kcal。${c.kcalFloor - K <= 200 ? "ナッツひとつかみでちょうどです" : "足せると理想的です"}`
    : null;

  const slots = ["morning", "noon", "snack", "night"];
  const w2 = lastTwoWeights(key);
  const w7 = weightAvg7(cursor);

  return `
    <div class="datenav">
      <button class="navbtn" data-move="-1">‹</button>
      <div>
        <div class="datetitle">${fmtJP(cursor)}</div>
        ${!isToday ? `<button class="todaybtn" data-today>今日へ戻る</button>` : ""}
      </div>
      <button class="navbtn" data-move="1" ${isToday ? "disabled" : ""}>›</button>
    </div>

    ${guard ? `<div class="banner protect">🍊 今週は<b>守りの週</b>です。記録だけで十分。目標は気にしなくて大丈夫です。
      <div style="margin-top:6px"><button class="btn-s" data-endprotect>早めに終える</button></div></div>` : ""}
    ${!guard && protectSuggest(toKey(new Date())) ? `<div class="banner">最近おつかれ気味のようです。<b>守りの週</b>（目標をお休みして記録だけにする1週間）にしますか？
      <div style="margin-top:6px;display:flex;gap:8px"><button class="btn-s" data-startprotect>守りの週にする</button><button class="btn-s" data-dismissprotect>今はこのまま</button></div></div>` : ""}
    ${obs ? `<div class="banner">🔍 観測期間 あと${obsDays}日。いつも通りでOKです。</div>` : ""}

    <div class="card g3">
      ${gaugeRow("🥩", "たんぱく質", P, c.pTarget ? Number(c.pTarget) : null, "g", ["達成です。しっかり入りました", "今日もきちんと届きました", "この調子です。よく食べられています"][new Date(key).getDate() % 3], null, guard)}
      ${gaugeRow("🌾", "食物繊維", FI, c.fiberTarget ? Number(c.fiberTarget) : null, "g", "達成です", hasFood && c.fiberTarget && FI < c.fiberTarget ? `あと ${(c.fiberTarget - FI).toFixed(1)}g 足せます（海藻・押し麦・オートミールが近道）` : null, guard)}
      ${c.sfiberTarget ? `<div class="gsub">└ うち水溶性 <b class="mono" style="color:${SF >= c.sfiberTarget ? "var(--green)" : "var(--text)"}">${SF}</b>${guard ? " g" : ` / ${c.sfiberTarget} g`}${guard ? "" : `<div class="hbar"><div class="fill" style="width:${Math.min(SF / c.sfiberTarget, 1) * 100}%;background:${SF >= c.sfiberTarget ? "var(--green)" : "var(--blue)"}"></div></div>`}</div>` : ""}
      <div class="grow">
        <div class="ghead">
          <span class="gname">⚡ エネルギー</span>
          <span class="gnum mono" style="color:${guard ? "var(--text)" : c.kcalFloor && K >= c.kcalFloor ? "var(--green)" : "var(--text)"}">${K.toLocaleString()}</span>
          <span class="gunit mono">kcal</span>
        </div>
        ${!guard && c.kcalFloor ? `<div class="hbar"><div class="fill" style="width:${Math.min(K / c.kcalFloor, 1) * 100}%;background:${K >= c.kcalFloor ? "var(--green)" : "var(--blue)"}"></div></div>` : ""}
        ${!guard && c.kcalFloor && K >= c.kcalFloor ? `<div class="gnote ok">✓ 下限クリア。よく食べられています</div>` : ""}
        ${!guard && kcalNote ? `<div class="gnote info">${kcalNote}</div>` : ""}
        ${SAT > 0 ? `<div class="gsub">飽和脂肪 <b class="mono">${SAT}</b> g（参考）</div>` : ""}
      </div>
    </div>

    <div class="section" style="padding-top:12px">
      <div class="seclabel">今週の食べ物・運動</div>
      ${rhythmCard(guard)}
    </div>

    <div class="card wcard">
      <span>⚖️</span>
      <input class="mono" data-field="weight" inputmode="decimal" placeholder="—" value="${day.weight ?? ""}"> kg
      ${!guard && c.wTarget ? `<span style="font-size:12.5px;color:var(--muted)">目標 ${c.wTarget} kg</span>` : ""}
      ${w7 ? `<span style="font-size:12.5px;color:var(--muted)">7日平均 <b class="mono">${w7}</b></span>` : ""}
      <div class="fatline">体脂肪 <input class="mono" data-field="fatpct" inputmode="decimal" placeholder="—" value="${day.fatpct ?? ""}" style="width:56px"> %</div>
    </div>
    ${!guard && day.weight != null && day.weight !== "" && c.wFloor && Number(day.weight) < Number(c.wFloor)
      ? `<div class="wnote low">少し軽めの日です。いつもの食事に、好きなものを1品足せると安心です。</div>` : ""}
    ${w2 && w2[1] > w2[0] ? `<div class="wnote up">✓ 少しずつ増えています。いい流れです</div>` : ""}
    <!-- 増加の褒めは目標でなく実績の肯定なので、守りの週でも意図的に表示する -->

    <div class="section" style="padding-bottom:0"><div class="seclabel" style="margin-bottom:0">きょうの調子</div></div>
    <div class="fatigue">
      ${[["ok", "😌 いつも通り"], ["tired", "😐 少し疲れ"], ["bad", "😞 かなり疲れ"]].map(([v, l]) =>
        `<button class="fbtn ${day.fatigue === v ? "on" : ""}" data-fatigue="${v}">${l}</button>`).join("")}
    </div>

    <div class="section">
      <div class="seclabel">きょうの記録</div>
      <div class="card" style="padding:4px 14px 8px">
        ${day.foods.length === 0 && !(day.moves || []).length
          ? `<div class="emptymsg">まだ記録がありません。「豆腐、蕎麦、鮭」のように単語だけでどうぞ。</div>`
          : slots.map((s) => {
              const fs = day.foods.map((f, i) => ({ f, i })).filter((x) => (x.f.slot || "night") === s);
              if (!fs.length) return "";
              return `<div class="slothead">${SLOT_LABEL[s]}</div>` + fs.map(({ f, i }) => `
                <div class="foodrow">
                  <button class="timechip mono ${f.t ? "set" : ""}" data-ftime="${i}" title="タップで時刻を記録（血糖の答え合わせ用・任意）">${esc(effTime(f))}</button>
                  <div class="foodname"><span class="nm">${esc(f.name)}</span><span class="badges">${f.fish?"🐟":""}${f.soy?"🫘":""}${f.nuts?"🥜":""}${f.ginger?"🫚":""}</span></div>
                  <div class="foodnums">
                    <span class="mono" style="color:var(--rose);font-size:14px">${num(f.p)}<small style="color:var(--muted)">P</small></span>
                    <span class="mono" style="color:var(--muted);font-size:13px">${Math.round(num(f.kcal))}<small>kcal</small></span>
                    <button class="delbtn" data-del="${i}">🗑</button>
                  </div>
                </div>`).join("");
            }).join("") + ((day.moves || []).length ? `<div class="slothead">運動</div>` + day.moves.map((m, i) => `
                <div class="foodrow">
                  <div class="foodname"><span class="nm" style="color:var(--rose)">${m.kind === "pilates" ? "🧘 ピラティス" : m.kind === "dumbbell" ? "💪 ダンベル" : `🚶 散歩 ${m.min}分`}</span></div>
                  <div class="foodnums"><button class="delbtn" data-mdel="${i}">🗑</button></div>
                </div>`).join("") : "")}
      </div>
    </div>

    <div class="movechips">
      <span class="mclabel">🚶 運動</span>
      <button class="chip" data-movechip="walk:10">10分</button>
      <button class="chip" data-movechip="walk:20">20分</button>
      <button class="chip" data-movechip="walk:30">30分</button>
      <button class="chip" data-movechip="walk:60">60分</button>
      <button class="chip" data-movechip="pilates:0">🧘 ピラティス</button>
      <button class="chip" data-movechip="dumbbell:0">💪 ダンベル</button>
    </div>

    <div class="stickybar">
      <div class="slotchips">
        ${SLOTS.map(([v, l]) => `<button class="chip ${currentSlot() === v ? "on" : ""}" data-slot="${v}">${l}</button>`).join("")}
      </div>
      <div class="inputrow">
        <textarea class="mealinput" rows="2" placeholder="豆腐、蕎麦、鮭（単語だけでOK）">${esc(inputText)}</textarea>
        <button class="sendbtn" data-send ${busy ? "disabled" : ""}>${busy ? '<span class="spin">◐</span>' : "⏎"}</button>
      </div>
      <div class="hint">${busy ? "計算中…（続きを打っていてOKです）" : "いつもの食品は登録済みの量で即記録。「朝：バナナ 昼：蕎麦 夜：豆腐」の一括入力もできます。"}</div>
      ${errMsg ? `<div class="errmsg">${esc(errMsg)}</div>` : ""}
    </div>
  `;
}

// ---------- 振り返り ----------
// トーン規約：目標に届かない側の色は水色のみ・目標線は細い破線・記録がない日は薄く表示するだけ（強調しない）
function ykDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const k = toKey(d), dd = data[k] || {};
    days.push({
      key: k, label: `${d.getMonth() + 1}/${d.getDate()}`,
      has: !!(dd.foods || []).length,
      p: Math.round(((dd.foods || []).reduce((a, f) => a + num(f.p), 0)) * 10) / 10,
      kcal: Math.round((dd.foods || []).reduce((a, f) => a + num(f.kcal), 0)),
      fiber: Math.round(((dd.foods || []).reduce((a, f) => a + num(f.fiber), 0)) * 10) / 10,
      weight: dd.weight != null && dd.weight !== "" ? Number(dd.weight) : null,
      fatpct: dd.fatpct != null && dd.fatpct !== "" ? Number(dd.fatpct) : null,
    });
  }
  return days;
}
function ykBarChart(days, field, target, color) {
  const W = 448, H = 150, padL = 34, padB = 20, padT = 10;
  const maxY = Math.max(target || 0, ...days.map((d) => d.has ? d[field] : 0)) * 1.08 || 1;
  const iw = (W - padL) / days.length;
  const y = (v) => padT + (H - padT - padB) * (1 - Math.min(v, maxY) / maxY);
  const bars = days.map((d, i) => {
    if (!d.has) return "";
    const v = d[field];
    const met = target != null && v >= target;
    const h = (H - padT - padB) * (Math.min(v, maxY) / maxY);
    return `<rect x="${(padL + i * iw + iw * 0.18).toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${(iw * 0.64).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="2" fill="${target == null ? color : met ? "#3A7A4C" : "#47719A"}"/>`;
  }).join("");
  const step = days.length > 20 ? 5 : days.length > 10 ? 3 : 1;
  const labels = days.map((d, i) => i % step === 0
    ? `<text x="${(padL + i * iw + (i === 0 ? 0 : iw / 2)).toFixed(1)}" y="${H - 5}" font-size="13" fill="#6E675F" text-anchor="${i === 0 ? "start" : "middle"}">${d.label}</text>` : "").join("");
  const grid = [0, maxY / 2].map((v) => `<line x1="${padL}" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#E9E5DF" stroke-width=".8"/>`).join("");
  const axis = [0, Math.round(maxY / 2), Math.round(maxY)].map((v) =>
    `<text x="${padL - 5}" y="${(y(v) + 4).toFixed(1)}" font-size="13" fill="#6E675F" text-anchor="end">${v}</text>`).join("");
  const tline = target != null ? `<line x1="${padL}" x2="${W}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" stroke="#3A7A4C" stroke-width="1.4" stroke-dasharray="4 3"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px">${grid}${axis}${bars}${tline}${labels}</svg>`;
}
function ykLineChart(days, field, color, target) {
  const pts = days.map((d, di) => ({ v: d[field], di, label: d.label })).filter((p) => p.v != null);
  if (pts.length < 2) return `<div style="font-size:13px;color:var(--muted);padding:12px 0">記録が2日分たまるとグラフが出ます。</div>`;
  const W = 448, H = 150, padL = 40, padB = 20, padT = 10;
  const vs = pts.map((p) => p.v).concat(target != null ? [Number(target)] : []);
  const lo = Math.min(...vs) - 0.6, hi = Math.max(...vs) + 0.6;
  const x = (p) => padL + (W - padL - 8) * (days.length === 1 ? 0.5 : p.di / (days.length - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const dots = pts.map((p) => `<circle cx="${x(p).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="${color}"/>`).join("");
  const grid = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${padL}" x2="${W - 8}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#E9E5DF" stroke-width=".8"/>`).join("");
  const axis = [lo, (lo + hi) / 2, hi].map((v) =>
    `<text x="${padL - 5}" y="${(y(v) + 4).toFixed(1)}" font-size="13" fill="#6E675F" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  const tline = target != null ? `<line x1="${padL}" x2="${W - 8}" y1="${y(Number(target)).toFixed(1)}" y2="${y(Number(target)).toFixed(1)}" stroke="#6E675F" stroke-width="1" stroke-dasharray="3 4"/>` : "";
  const anch = (px) => px - padL < 16 ? "start" : (W - 8) - px < 16 ? "end" : "middle";
  const labels = pts.map((p, i) => (i === 0 || i === pts.length - 1)
    ? `<text x="${x(p).toFixed(1)}" y="${H - 5}" font-size="13" fill="#6E675F" text-anchor="${anch(x(p))}">${p.label}</text>` : "").join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px">${grid}${axis}${tline}<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>${dots}${labels}</svg>`;
}
function buildCsv() {
  const keys = Object.keys(data).sort();
  const rows = ["date,protein_g,fiber_g,soluble_fiber_g,kcal,satfat_g,weight_kg,fatpct,fatigue,foods"];
  for (const k of keys) {
    const dd = data[k];
    if (!dd) continue;
    const fs = dd.foods || [];
    rows.push([k,
      fs.reduce((a, f) => a + num(f.p), 0), fs.reduce((a, f) => a + num(f.fiber), 0),
      fs.reduce((a, f) => a + num(f.sfiber), 0), Math.round(fs.reduce((a, f) => a + num(f.kcal), 0)),
      fs.reduce((a, f) => a + num(f.satfat), 0), dd.weight ?? "", dd.fatpct ?? "", dd.fatigue ?? "",
      '"' + fs.map((f) => `${SLOT_LABEL[f.slot] || ""}${f.t ? "(" + f.t + ")" : ""}:${String(f.name).replace(/"/g, "")}`).join("・") + '"',
    ].join(","));
  }
  return rows.join("\n");
}
function renderReview() {
  const c = cfg();
  const guard = protectActive(toKey(new Date()));
  const days = ykDays(range);
  const logged = days.filter((d) => d.has);
  const avgP = logged.length ? Math.round(logged.reduce((a, d) => a + d.p, 0) / logged.length) : 0;
  const avgK = logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : 0;
  const okDays = c.kcalFloor ? logged.filter((d) => d.kcal >= Number(c.kcalFloor)).length : null;
  const wk = weeklyCounts(toKey(new Date()));
  const w7 = weightAvg7(new Date());
  return `
    <div class="rangebtns">
      <button class="btn-s ${range === 14 ? "on" : ""}" data-range="14">2週間</button>
      <button class="btn-s ${range === 30 ? "on" : ""}" data-range="30">1ヶ月</button>
      <button class="btn-s" data-csv style="margin-left:auto">⬇ CSV</button>
    </div>
    <div class="sumgrid">
      <div class="sumcard"><div class="sumlabel">平均たんぱく質</div><div><span class="sumval mono" style="color:${c.pTarget && avgP >= Number(c.pTarget) ? "var(--green)" : "var(--text)"}">${avgP}</span><span class="sumunit mono"> g</span></div><div class="sumnote">記録 ${logged.length}日</div></div>
      <div class="sumcard"><div class="sumlabel">平均エネルギー</div><div><span class="sumval mono">${avgK.toLocaleString()}</span><span class="sumunit mono"> kcal</span></div>${!guard && okDays != null ? `<div class="sumnote">しっかり食べられた日 ${okDays}/${logged.length}日</div>` : ""}</div>
      <div class="sumcard"><div class="sumlabel">⚖️ 体重（7日平均）</div><div><span class="sumval mono">${w7 ?? "—"}</span><span class="sumunit mono"> kg</span></div>${!guard && c.wTarget ? `<div class="sumnote">目標 ${c.wTarget} kg</div>` : ""}</div>
      <div class="sumcard"><div class="sumlabel">🫚 生姜紅茶</div><div><span class="sumval mono" style="color:${wk.ginger > 0 ? "var(--green)" : "var(--text)"}">${wk.ginger}</span><span class="sumunit mono"> 日</span></div><div class="sumnote">今週飲めた日</div></div>
    </div>

    <div class="section">
      <div class="seclabel">今週の食べ物・運動リスト</div>
      ${rhythmCard(guard)}
      ${guard ? "" : `<div class="hint" style="margin:6px 0 0">できた日を数えるだけのリストです。月曜から新しい週が始まります。</div>`}
    </div>

    <div class="chartbox">
      <div class="seclabel">🥩 たんぱく質の推移</div>
      ${ykBarChart(days, "p", guard ? null : (c.pTarget ? Number(c.pTarget) : null), "#47719A")}
    </div>
    <div class="chartbox">
      <div class="seclabel">⚡ エネルギーの推移</div>
      ${ykBarChart(days, "kcal", guard ? null : (c.kcalFloor ? Number(c.kcalFloor) : null), "#47719A")}
      ${!guard && c.kcalFloor ? `<div class="hint" style="margin:4px 0 0">緑の破線＝下限 ${Number(c.kcalFloor).toLocaleString()} kcal（届いた日は緑）</div>` : ""}
    </div>
    <div class="chartbox">
      <div class="seclabel">⚖️ 体重の推移</div>
      ${ykLineChart(days, "weight", "#CE7328", guard ? null : c.wTarget)}
    </div>
    <div class="chartbox">
      <div class="seclabel">体脂肪率の推移</div>
      ${ykLineChart(days, "fatpct", "#47719A", null)}
    </div>

    <div class="section" style="padding-bottom:48px">
      <div class="seclabel">日別ログ</div>
      <div class="card daylist">
        ${days.slice().reverse().map((d) => `
          <div class="dayrow ${d.has ? "" : "off"}">
            <span class="mono" style="width:44px">${d.label}</span>
            <span class="mono" style="color:${d.has ? "var(--text)" : "var(--muted)"}">${d.has ? d.p + "P" : "—"}</span>
            <span class="mono" style="color:var(--muted)">${d.has ? d.kcal.toLocaleString() + "kcal" : ""}</span>
            <span class="mono" style="margin-left:auto;color:var(--muted)">${d.weight != null ? d.weight.toFixed(1) + "kg" : ""}</span>
          </div>`).join("")}
      </div>
    </div>
  `;
}

function renderSettings() {
  const c = cfg();
  const hasKey = !!apiKey();
  return `
    <div class="section" style="padding-top:4px;padding-bottom:48px">
      <div class="card setbox">
        <div class="settitle">🎯 目標の設定</div>
        <div class="setdesc">数値はあなた専用の設定としてこの端末に保存されます（3ヶ月ごとに見直す前提の値です）。</div>
        <div class="field"><label>たんぱく質 目標（g/日）</label><input class="mono" id="c-pTarget" inputmode="decimal" value="${c.pTarget ?? ""}"></div>
        <div class="field"><label>食物繊維 目標（g/日）</label><input class="mono" id="c-fiberTarget" inputmode="decimal" value="${c.fiberTarget ?? ""}"></div>
        <div class="field"><label>うち水溶性（g/日）</label><input class="mono" id="c-sfiberTarget" inputmode="decimal" value="${c.sfiberTarget ?? ""}"></div>
        <div class="field"><label>エネルギー下限（kcal/日）</label><input class="mono" id="c-kcalFloor" inputmode="numeric" value="${c.kcalFloor ?? ""}"></div>
        <div class="field"><label>体重 目標（kg）</label><input class="mono" id="c-wTarget" inputmode="decimal" value="${c.wTarget ?? ""}"></div>
        <div class="field"><label>体重 下限（kg）</label><input class="mono" id="c-wFloor" inputmode="decimal" value="${c.wFloor ?? ""}"></div>
        <div class="field"><label>観測期間の最終日</label><input class="mono" id="c-obsEnd" type="date" value="${c.obsEnd ?? ""}"></div>
        <div class="field"><label>🫚 生姜のとり方</label><select id="c-ginger">
          ${["", "チューブ生姜", "冷凍生姜キューブ", "生姜パウダー", "ティーバッグ"].map((v) => `<option value="${v}" ${c.ginger === v ? "selected" : ""}>${v || "選ぶ"}</option>`).join("")}
        </select></div>
        <div class="setdesc" style="margin:8px 0 0">🫚 は続けやすい形でOK。夕方以降に飲むならデカフェの紅茶がおすすめです（睡眠のため）。</div>
        <div class="setrow"><button class="setbtn" data-savecfg>保存</button></div>
        ${setMsg && setMsg.startsWith("目標") ? `<div class="okmsg">${esc(setMsg)}</div>` : ""}
      </div>

      <div class="card setbox">
        <div class="settitle">🌸 守りの週</div>
        <div class="setdesc">疲れている週は、目標をお休みして「記録するだけ」にできます（7日間・自動解除）。いつでも手動で始められます。</div>
        <div style="font-size:13px;margin-bottom:4px;color:${protectActive(toKey(new Date())) ? "var(--rose)" : "var(--muted)"}">現在：${protectActive(toKey(new Date())) ? "守りの週です（" + protect().until + " まで）" : "通常モード"}</div>
        <div class="setrow">
          ${protectActive(toKey(new Date()))
            ? `<button class="setbtn ghost" data-endprotect>終える</button>`
            : `<button class="setbtn" data-startprotect>今週を守りの週にする</button>`}
        </div>
      </div>

      <div class="card setbox">
        <div class="settitle">⏱ 区分の代表時刻</div>
        <div class="setdesc">個別の時刻を記録しなかった食事は、この時刻に食べたものとしてリブレとの答え合わせ・血糖の計算に使われます。ふだんの食事時刻に合わせておくと精度が上がります（記録の手間は増えません）。</div>
        ${SLOTS.map(([v, l]) => `<div class="field"><label>${l}</label><input type="time" id="st-${v}" value="${slotTime(v)}"></div>`).join("")}
        <div class="setrow"><button class="setbtn" data-saveslottimes>保存</button></div>
        ${setMsg && setMsg.startsWith("代表時刻") ? `<div class="okmsg">${esc(setMsg)}</div>` : ""}
      </div>

      <div class="card setbox">
        <div class="settitle">🔑 AI概算のAPIキー</div>
        <div class="setdesc">辞書にない食品を送ったときだけAIが栄養を概算します。キーはこの端末の中にだけ保存されます。</div>
        <div style="font-size:13px;margin-bottom:8px;color:${hasKey ? "var(--green)" : "var(--muted)"}">現在：${hasKey ? "登録済み ✓" : "未登録（辞書の食品はキーなしで使えます）"}</div>
        <input class="setinput mono" id="apikeyInput" type="password" placeholder="sk-ant-..." value="${hasKey ? "●●●●●●●●" : ""}">
        <div class="setrow">
          <button class="setbtn" data-savekey>保存</button>
          ${hasKey ? `<button class="setbtn ghost" data-delkey>削除</button>` : ""}
        </div>
        ${setMsg && setMsg.startsWith("キー") ? `<div class="okmsg">${esc(setMsg)}</div>` : ""}
      </div>

      <div class="card setbox">
        <div class="settitle">🔄 デバイス間同期（GitHub Gist）</div>
        <div class="setdesc">GitHubの秘密Gistに自動保存して複数端末で共有できます（任意）。gist権限のみのトークンを貼って保存。</div>
        <div style="font-size:13px;margin-bottom:8px;color:${ghToken() ? (syncState === "error" ? "var(--blue)" : "var(--green)") : "var(--muted)"}">
          現在：${!ghToken() ? "未設定（データはこの端末内のみ）" : syncState === "busy" ? '<span class="spin">↻</span> 同期中…' : syncState === "error" ? "同期エラー（トークン・通信を確認）" : "設定済み ✓"}
        </div>
        <input class="setinput mono" id="ghtokenInput" type="password" placeholder="github_pat_..." value="${ghToken() ? "●●●●●●●●" : ""}">
        <div class="setrow">
          <button class="setbtn" data-savegh>保存して同期</button>
          ${ghToken() ? `<button class="setbtn ghost" data-delgh>削除</button>` : ""}
        </div>
      </div>

      <div class="card setbox">
        <div class="settitle">💾 バックアップ</div>
        <div class="setrow">
          <button class="setbtn ghost" data-exportjson>JSONで書き出し</button>
          <button class="setbtn ghost" data-importjson>JSONから復元</button>
        </div>
      </div>

      <div class="card setbox">
        <div class="settitle">ℹ️ このアプリについて</div>
        <div class="setdesc">
          foodlog YK — しっかり食べて、少しずつ増やすための食事ログ。<br>
          記録は1日2〜3分でOK。単語だけの入力（例：豆腐、蕎麦、鮭）で栄養を自動計算します。<br>
          エネルギーとたんぱく質は「届いたら緑」。届かない日があっても大丈夫、翌日に足せば十分です。<br>
          データ保存：この端末＋（設定時のみ）あなたのGitHub秘密Gist。それ以外の外部には送信しません。
        </div>
      </div>
    </div>
  `;
}

function render() {
  const app = $("#app");
  const body = view === "log" ? renderLog() : view === "review" ? renderReview() : renderSettings();
  app.innerHTML = `
    <div class="tabs">
      ${[["log", "記録"], ["review", "振り返り"], ["settings", "設定"]].map(([v, l]) =>
        `<button class="tab ${view === v ? "on" : ""}" data-view="${v}">${l}</button>`).join("")}
    </div>
    ${body}
  `;
  bindEvents();
}

// ---------- イベント ----------
function bindEvents() {
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => { view = b.dataset.view; errMsg = ""; setMsg = ""; render(); }));
  document.querySelectorAll("[data-move]").forEach((b) =>
    b.addEventListener("click", () => { const d = new Date(cursor); d.setDate(d.getDate() + Number(b.dataset.move)); cursor = d; errMsg = ""; slotSel = null; render(); }));
  const tb = $("[data-today]"); if (tb) tb.addEventListener("click", () => { cursor = new Date(); render(); });

  const ta = $(".mealinput");
  if (ta) {
    ta.addEventListener("input", () => { inputText = ta.value; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitText(); });
  }
  const send = $("[data-send]"); if (send) send.addEventListener("click", submitText);
  document.querySelectorAll("[data-slot]").forEach((b) =>
    b.addEventListener("click", () => { slotSel = b.dataset.slot; slotSelKey = toKey(new Date()); render(); }));

  document.querySelectorAll("[data-ftime]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.ftime);
      const key = toKey(cursor);
      const day = getDay(key);
      const f = day.foods[i];
      const v = prompt("食べた時刻（例 19:45）。空欄で区分の代表時刻（" + slotTime(f.slot) + "）に戻します。", f.t || "");
      if (v === null) return;
      const t = v.trim() === "" ? null : validHHMM(v);
      if (v.trim() !== "" && !t) { alert("HH:MM形式で入力してください（例 8:05、19:45）"); return; }
      updateDay(key, { foods: day.foods.map((x, idx) => idx === i ? Object.assign({}, x, { t }) : x) });
    }));
  document.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = toKey(cursor);
      updateDay(key, { foods: getDay(key).foods.filter((_, i) => i !== Number(b.dataset.del)) });
    }));
  document.querySelectorAll("[data-mdel]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = toKey(cursor);
      updateDay(key, { moves: (getDay(key).moves || []).filter((_, i) => i !== Number(b.dataset.mdel)) });
    }));
  document.querySelectorAll("[data-movechip]").forEach((b) =>
    b.addEventListener("click", () => {
      const [kind, min] = b.dataset.movechip.split(":");
      const key = toKey(cursor);
      updateDay(key, { moves: (getDay(key).moves || []).concat({ kind, min: Number(min) }) });
    }));
  document.querySelectorAll("[data-fatigue]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = toKey(cursor);
      const cur = getDay(key).fatigue;
      updateDay(key, { fatigue: cur === b.dataset.fatigue ? null : b.dataset.fatigue });
    }));
  document.querySelectorAll("[data-field]").forEach((inp) =>
    inp.addEventListener("change", () => {
      const v = inp.value.replace(/[^0-9.]/g, "");
      updateDay(toKey(cursor), { [inp.dataset.field]: v || null });
    }));

  document.querySelectorAll("[data-range]").forEach((b) =>
    b.addEventListener("click", () => { range = Number(b.dataset.range); render(); }));
  const csv = $("[data-csv]"); if (csv) csv.addEventListener("click", () => {
    const blob = new Blob(["\uFEFF" + buildCsv()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `foodlogYK_${toKey(new Date())}.csv`; a.click();
  });
  const sp = $("[data-startprotect]"); if (sp) sp.addEventListener("click", startProtect);
  const ep = $("[data-endprotect]"); if (ep) ep.addEventListener("click", endProtect);
  const dp = $("[data-dismissprotect]"); if (dp) dp.addEventListener("click", dismissProtect);

  const sc = $("[data-savecfg]"); if (sc) sc.addEventListener("click", () => {
    const g = (id) => { const v = $(id).value.trim(); return v === "" ? null : v; };
    saveCfg({
      pTarget: g("#c-pTarget"), fiberTarget: g("#c-fiberTarget"), sfiberTarget: g("#c-sfiberTarget"),
      kcalFloor: g("#c-kcalFloor"), wTarget: g("#c-wTarget"), wFloor: g("#c-wFloor"),
      obsEnd: g("#c-obsEnd"), ginger: $("#c-ginger").value || null,
    });
    setMsg = "目標を保存しました。"; render();
  });
  const st = $("[data-saveslottimes]"); if (st) st.addEventListener("click", () => {
    const times = {};
    for (const [v] of SLOTS) { const el = $("#st-" + v); if (el && el.value) times[v] = el.value; }
    saveCfg({ slotTimes: times });
    setMsg = "代表時刻を保存しました。"; render();
  });
  const sk = $("[data-savekey]"); if (sk) sk.addEventListener("click", () => {
    const v = $("#apikeyInput").value.trim();
    if (!v || v.startsWith("●")) { setMsg = "キーを入力してください。"; render(); return; }
    localStorage.setItem(API_KEY_KEY, v);
    setMsg = "キーを保存しました。"; render();
  });
  const dk = $("[data-delkey]"); if (dk) dk.addEventListener("click", () => { localStorage.removeItem(API_KEY_KEY); setMsg = "キーを削除しました。"; render(); });
  const sg = $("[data-savegh]"); if (sg) sg.addEventListener("click", async () => {
    const v = $("#ghtokenInput").value.trim();
    if (v && !v.startsWith("●")) localStorage.setItem(GH_TOKEN_KEY, v);
    syncReady = false; await syncNow();
  });
  const dg = $("[data-delgh]"); if (dg) dg.addEventListener("click", () => {
    localStorage.removeItem(GH_TOKEN_KEY); localStorage.removeItem(GIST_ID_KEY); syncState = "off"; render();
  });
  const ex = $("[data-exportjson]"); if (ex) ex.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `foodlogYK_backup_${toKey(new Date())}.json`; a.click();
  });
  const im = $("[data-importjson]"); if (im) im.addEventListener("click", () => $("#importInput").click());
}
$("#importInput").addEventListener("change", () => {
  const f = $("#importInput").files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (obj && typeof obj === "object") { mergeRemote(obj); save(); render(); alert("復元しました。"); }
    } catch (e) { alert("ファイルを読み込めませんでした。"); }
  };
  r.readAsText(f);
});

// ---------- Gist同期（foodlog本体と同方式。ファイル名とキーはM専用に分離） ----------
function mergeRemote(remote) {
  if (!remote || typeof remote !== "object") return;
  for (const k of Object.keys(remote)) {
    const r = remote[k], l = data[k];
    if (!r) continue;
    if (!l || (Number(r._m) || 0) > (Number(l._m) || 0)) data[k] = r;
  }
}
async function ghApi(path, opts) {
  return fetch("https://api.github.com" + path, Object.assign({ headers: {
    "Authorization": "Bearer " + ghToken(), "Accept": "application/vnd.github+json", "Content-Type": "application/json",
  } }, opts));
}
async function syncPull() {
  if (!ghToken()) return;
  let id = gistId();
  if (!id) {
    const res = await ghApi("/gists?per_page=100");
    if (!res.ok) throw new Error("gist list " + res.status);
    const list = await res.json();
    const hit = list.find((g) => g.files && g.files[GIST_FILE]);
    if (!hit) return;
    id = hit.id;
    localStorage.setItem(GIST_ID_KEY, id);
  }
  const res = await ghApi("/gists/" + id);
  if (res.status === 404) { localStorage.removeItem(GIST_ID_KEY); return; }
  if (!res.ok) throw new Error("gist get " + res.status);
  const g = await res.json();
  const f = g.files && g.files[GIST_FILE];
  if (!f) return;
  let content = f.content;
  if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text();
  mergeRemote(JSON.parse(content));
  try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) {}
}
async function syncPush() {
  if (!ghToken()) return;
  const content = JSON.stringify(data);
  let id = gistId();
  let res = null;
  if (id) {
    res = await ghApi("/gists/" + id, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content } } }) });
    if (res.status === 404) { localStorage.removeItem(GIST_ID_KEY); id = ""; }
  }
  if (!id) {
    res = await ghApi("/gists", { method: "POST", body: JSON.stringify({ public: false, description: "foodlog-YK data (auto-sync)", files: { [GIST_FILE]: { content } } }) });
    if (res.ok) { const g = await res.json(); if (g.id) localStorage.setItem(GIST_ID_KEY, g.id); }
  }
  if (!res || !res.ok) throw new Error("gist push " + (res ? res.status : "?"));
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
}
function schedulePush() {
  if (!ghToken() || !syncReady) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { syncState = "busy"; await syncPush(); syncState = "ok"; }
    catch (e) { syncState = "error"; }
    if (view === "settings") render();
  }, 2500);
}
async function syncNow() {
  if (!ghToken()) { syncReady = true; return; }
  syncState = "busy"; render();
  try { await syncPull(); await syncPush(); syncState = "ok"; }
  catch (e) { syncState = "error"; }
  syncReady = true;
  render();
}

// ---------- 起動 ----------
load();
syncReady = !ghToken();
render();
if (ghToken()) syncNow();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
