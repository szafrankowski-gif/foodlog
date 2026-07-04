/* foodlog — 食事ログPWA */
"use strict";

const FLOOR = 100, CEILING = 120;
const CARB_LIMIT = { rest: 250, active: 330 }; // 61kg・高活動量での維持ライン。血糖対策は量でなく質とタイミングで
const DATA_KEY = "mealog:data";
const API_KEY_KEY = "mealog:apikey";
// 用途別モデル（コストと質のバランス。変えたい時はここを編集）
const MODEL_ESTIMATE = "claude-haiku-4-5-20251001"; // テキスト概算：軽量・高速・低コスト
const MODEL_PHOTO    = "claude-sonnet-4-6";          // 写真解析：認識精度重視
const MODEL_BAKAO    = "claude-sonnet-4-6";          // ばかお評価：文章の質重視
const MODEL_TEST     = MODEL_ESTIMATE;               // キー保存時のテスト用（最安）

const DAY_LABEL = { rest: "休養", trainA: "筋トレA", trainB: "筋トレB", climb: "登攀・柔術", mountain: "山行" };
const DAY_SHORT = { trainA: "筋A", trainB: "筋B", climb: "登", mountain: "山" };
const isActive = (t) => !!t && t !== "rest";

const MENU = {
  trainA: [
    { id: "rdl",     name: "KB RDL",             spec: "16kg 10×3・3秒下ろし" },
    { id: "goblet",  name: "ゴブレットスクワット", spec: "16kg 10×3・下で2秒" },
    { id: "swing",   name: "KBスイング",          spec: "16kg 15×3" },
    { id: "cossack", name: "コサックスクワット",   spec: "左右6×3" },
    { id: "calf",    name: "片脚カーフレイズ",     spec: "KB保持 12×2" },
  ],
  trainB: [
    { id: "pullup",  name: "懸垂",               spec: "できる回数×3" },
    { id: "row",     name: "片手ロウ",           spec: "8-10kg 10×3" },
    { id: "pushup",  name: "PUバー腕立て",        spec: "10×3" },
    { id: "ohp",     name: "ショルダープレス",     spec: "中立 8-10kg 10×3" },
    { id: "extrot",  name: "外旋（腱板）",         spec: "2-3kg 15×3" },
    { id: "plank",   name: "肘つきプランク",       spec: "30秒×3" },
    { id: "neck",    name: "首アイソメ",           spec: "前後左右 各10秒×3" },
  ],
};

const PACE = [
  { key: "saba",  label: "鯖缶",         target: 3, color: "#5FC9DE" },
  { key: "fish",  label: "生魚・別魚種", target: 1, color: "#5FC9DE" },
  { key: "tuna",  label: "ツナ缶",       target: 2, color: "#9D8CE0" },
  { key: "red",   label: "赤身肉",       target: 1, color: "#E08C8C" },
  { key: "shell", label: "貝類",         target: 1, color: "#F0B458" },
];

const SEED = {
  "2026-06-30": { dayType: "rest", sleep: null, walked: false, weight: null, comment: null, foods: [
    { name: "バナナ", p: 1, c: 27 }, { name: "ゆで卵", p: 6, c: 0 },
    { name: "プロテイン+クレアチン+牛乳", p: 27, c: 8 },
    { name: "鯖缶（そうめん）", p: 20, c: 0, omega3: true, cat: "saba" },
    { name: "そうめん", p: 5, c: 40 },
    { name: "プチトマト・オクラ", p: 2, c: 6, veg: true, fiber: true },
    { name: "かぼちゃ蒸し", p: 2, c: 15, veg: true, fiber: true },
    { name: "ゆで卵", p: 6, c: 0 }, { name: "かりんとう", p: 1, c: 15 },
    { name: "赤身ステーキ400g", p: 90, c: 0, cat: "red" },
    { name: "付け合わせ（人参・玉ねぎ・ポテト）", p: 5, c: 33, veg: true },
    { name: "ご飯1膳", p: 4, c: 55 },
  ] },
  "2026-07-01": { dayType: "rest", sleep: null, walked: false, weight: null, comment: null, foods: [
    { name: "バナナ", p: 1, c: 27 },
    { name: "玄米", p: 4, c: 50, fiber: true },
    { name: "鯖缶（ボウル）", p: 20, c: 0, omega3: true, cat: "saba" },
    { name: "オクラ・トマト・しそ", p: 2, c: 6, veg: true, fiber: true },
    { name: "かぼちゃ", p: 2, c: 15, veg: true, fiber: true },
    { name: "炒り卵（卵2個）", p: 12, c: 1 },
    { name: "プロテイン+クレアチン+牛乳", p: 23, c: 8 },
    { name: "焼肉（タン・カルビ・ロース・ハラミ）", p: 40, c: 2, cat: "red" },
    { name: "プルコギ", p: 10, c: 8 },
    { name: "ナムル・キムチ・海苔・サンチュ", p: 5, c: 8, veg: true, fiber: true },
    { name: "スープ", p: 2, c: 3 }, { name: "ポップコーン", p: 3, c: 18 },
  ] },
  "2026-07-02": { dayType: "climb", sleep: null, walked: false, weight: null, comment: null, foods: [
    { name: "バナナ", p: 1, c: 27 },
    { name: "鯖缶（うどん）", p: 20, c: 0, omega3: true, cat: "saba" },
    { name: "うどん", p: 6, c: 50 },
    { name: "みょうが・しそ・トマト・オクラ", p: 2, c: 6, veg: true, fiber: true },
    { name: "かぼちゃ小鉢", p: 2, c: 15, veg: true, fiber: true },
    { name: "プロテイン+クレアチン+牛乳", p: 23, c: 8 },
    { name: "小魚アーモンド+ミックスナッツ20g", p: 4, c: 4, fiber: true },
    { name: "チョコひとかけ", p: 0, c: 5 }, { name: "プラム2個", p: 1, c: 15 },
    { name: "牛丼アタマ大盛り（松屋）", p: 24, c: 90, cat: "red" },
    { name: "生卵", p: 6, c: 0 },
    { name: "味噌汁（わかめ・油揚げ）", p: 2, c: 4, fiber: true },
  ] },
  "2026-07-03": { dayType: "rest", sleep: null, walked: false, weight: null, comment: null, foods: [
    { name: "白桃アールグレイタルト（スタバ）", p: 3, c: 33 },
  ] },
};

// ---------- 状態 ----------
let data = {};
let view = "log";        // log | review | settings
let cursor = new Date();
let range = 14;
let busy = false, commentBusy = false;
let errMsg = "", setMsg = "";
let inputText = "";

// ---------- ユーティリティ ----------
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtJP = (d) => `${d.getMonth() + 1}/${d.getDate()}（${"日月火水木金土"[d.getDay()]}）`;
const emptyDay = () => ({ foods: [], dayType: "rest", sleep: null, walked: false, weight: null, comment: null });
const sumP = (dd) => (dd && dd.foods || []).reduce((s, f) => s + (Number(f.p) || 0), 0);
const sumC = (dd) => (dd && dd.foods || []).reduce((s, f) => s + (Number(f.c) || 0), 0);
const getDay = (k) => data[k] || emptyDay();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function load() {
  let stored = null;
  try { const raw = localStorage.getItem(DATA_KEY); if (raw) stored = JSON.parse(raw); } catch (e) {}
  data = Object.assign({}, SEED, stored || {});
  for (const k of Object.keys(data)) {
    if (data[k] && data[k].dayType === "active") data[k].dayType = "climb";
  }
  save();
}
function save() {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) {}
}
function updateDay(key, patch) {
  data[key] = Object.assign({}, getDay(key), patch);
  save();
  render();
}
function apiKey() { return localStorage.getItem(API_KEY_KEY) || ""; }

function pace7(anchorKey) {
  const [y, m, d] = anchorKey.split("-").map(Number);
  const counts = { saba: 0, fish: 0, tuna: 0, red: 0, shell: 0 };
  for (let i = 0; i < 7; i++) {
    const dd = data[toKey(new Date(y, m - 1, d - i))];
    ((dd && dd.foods) || []).forEach((f) => { if (f.cat && counts[f.cat] != null) counts[f.cat]++; });
  }
  return counts;
}
function weekAvgFor(anchor) {
  let sum = 0, n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor); d.setDate(d.getDate() - i);
    const dd = data[toKey(d)];
    if (dd && dd.foods.length) { sum += sumP(dd); n++; }
  }
  return n ? Math.round(sum / n) : null;
}

// ---------- Anthropic API ----------
const NUTRITION_RULES = `各品目について次を判定：
- p: たんぱく質g(整数)
- c: 糖質(炭水化物)g(整数)
- veg: 緑黄色野菜か(にんじん/トマト/かぼちゃ/ほうれん草/小松菜/ブロッコリー/オクラ/ピーマン等ならtrue)
- omega3: オメガ3が豊富な魚か(鯖/いわし/あじ/鮭/さんま等の青魚・鮭ならtrue。ツナ・白身魚はfalse)
- fiber: 食物繊維が豊富か(海藻/きのこ/豆類/野菜/全粒穀物/玄米等ならtrue)
- cat: 食材カテゴリ。鯖の缶詰なら"saba"、それ以外の魚(鮭/いわし/あじ/さんま/白身魚/生魚/焼き魚、および鯖の生・焼き)なら"fish"、ツナ缶なら"tuna"、牛・ラム等の赤身肉(焼肉/ステーキ/牛丼含む)なら"red"、貝類(あさり/牡蠣/しじみ/ホタテ等)なら"shell"、いずれでもなければ""(空文字)
ユーザーがたんぱく質や糖質のg数を明記していた場合はその値を優先すること。
出力はJSON配列のみ。各要素は {"name":品名,"p":int,"c":int,"veg":bool,"omega3":bool,"fiber":bool,"cat":string}。
前置き・説明・コードフェンス・マークダウンは一切不要。`;

async function callApi(body) {
  const key = apiKey();
  if (!key) throw new Error("NO_KEY");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "API error");
  return json.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function parseItems(raw) {
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  return parsed.filter((x) => x && x.name).map((x) => {
    const it = { name: String(x.name), p: Math.max(0, Math.round(Number(x.p) || 0)), c: Math.max(0, Math.round(Number(x.c) || 0)) };
    if (x.veg) it.veg = true;
    if (x.omega3) it.omega3 = true;
    if (x.fiber) it.fiber = true;
    if (["saba", "fish", "tuna", "red", "shell"].includes(x.cat)) it.cat = x.cat;
    return it;
  });
}

async function estimateNutrition(text) {
  const raw = await callApi({
    model: MODEL_ESTIMATE, max_tokens: 1200,
    messages: [{ role: "user", content:
`あなたは栄養士です。次の食事メモから品目ごとに推定してください。
分量の記載(例「玄米150g」「卵2個」)は分量として解釈。分量指定がなければ一般的な1食分で推定。
${NUTRITION_RULES}

食事メモ：${text}` }],
  });
  return parseItems(raw);
}

async function estimateFromPhoto(base64, mediaType, hint) {
  const content = [
    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
    { type: "text", text:
`あなたは栄養士です。この食事写真に写っている品目を特定し、それぞれの栄養を推定してください。
${hint ? "補足メモ：" + hint + "\n" : ""}${NUTRITION_RULES}` },
  ];
  const raw = await callApi({ model: MODEL_PHOTO, max_tokens: 1200, messages: [{ role: "user", content }] });
  return parseItems(raw);
}

async function fetchBakao(key) {
  const day = getDay(key);
  const total = sumP(day), carbs = sumC(day);
  const target = isActive(day.dayType) ? CEILING : FLOOR;
  const hasVeg = day.foods.some((f) => f.veg);
  const hasOmega3 = day.foods.some((f) => f.omega3);
  const foodList = day.foods.map((f) => `${f.name}(P${f.p})`).join("、");
  const [y, m, d] = key.split("-").map(Number);
  const dateLabel = fmtJP(new Date(y, m - 1, d));
  const isToday = toKey(new Date()) === key;
  const now = new Date(), hh = now.getHours(), mm = pad(now.getMinutes());
  const phase = !isToday ? "past"
    : (hh >= 3 && hh < 12) ? "morning"
    : (hh >= 12 && hh < 18) ? "midday"
    : (hh >= 18 && hh < 24) ? "evening" : "closing";
  const phaseNote = {
    past: "これは過去の日の振り返りです。締めの総括として評価してください。",
    morning: "まだ一日の序盤（この人は起床9:30）。締めの総括は絶対にしないこと。ここまでの立ち上がりを評価し、残りの食事でどう届くかの見通しを軽く示す。",
    midday: "まだ一日の中盤。締めの総括は絶対にしないこと。「今日はここまで」等の締め言葉も禁止。進捗として評価し、夜（この人の夕食は遅め）で目標に届く道筋を一言添える。",
    evening: "一日の終盤だが、この人は夜型（練習20〜23時、夕食も遅い）でまだ食事が残っている可能性が高い。締めすぎず、残りの補給の余地に触れてよい。",
    closing: "就寝（2:30）前の時間帯。今日の締めの総括として評価してよい。",
  }[phase];
  const pc = pace7(key);
  const raw = await callApi({
    model: MODEL_BAKAO, max_tokens: 500,
    messages: [{ role: "user", content:
`あなたは「塔ノ岳 ばかお」という栄養担当のコーチです。48歳男性クライマー・登山者（170cm/61kg、維持目標、TFCC損傷回復期、血糖やや高め・HbA1c5.9、起床9:30・就寝2:30の夜型）の食事ログに、一言評価を返します。

評価の姿勢（厳守）：
- 事実を淡々と。達成率が低い日に「満点」「完璧」と言わない
- ダメ出しもしない
- 完璧主義による息切れが最大リスクの人なので、圧をかけない
- 良い点をひとつ具体的に挙げる。提案はあっても軽く一つまで

現在時刻：${hh}:${mm}
時間帯の扱い（最重要）：${phaseNote}

目標：たんぱく質は基準100g（毎日必達）、運動日は120gを目標にする（120gは上限ではなく、超えても全く問題ない）。糖質の目安は休養日250g前後、運動日330g前後（維持目標・高活動量のため十分に摂る方針。血糖対策は玄米優先・食後散歩・ドカ食い回避で行い、総量を過度に絞らない）。

筋トレ設計：週2（A=ヒンジ・脚／B=引く・押す・体幹）。筋トレ日は目標120gを狙い、トレ60分前に補食+コラーゲン+C、トレ後60分に回復食。翌朝の手首に違和感が出たら一段戻すルール。

対象日（${dateLabel}・${DAY_LABEL[day.dayType] || "休養"}）のデータ：
- たんぱく質：${total}g（目標${target}g）
- 糖質：${carbs}g
- 食後散歩：${day.walked ? "した" : "記録なし"}
- 緑黄色野菜：${hasVeg ? "あり" : "なし"}／オメガ3の魚：${hasOmega3 ? "あり" : "なし"}
- 運動：${DAY_LABEL[day.dayType] || "休養"}${MENU[day.dayType] ? `／実施種目：${(((day.workout||{}).checks)||[]).length}/${MENU[day.dayType].length}${(day.workout&&day.workout.note)?`（メモ：${day.workout.note}）`:""}` : ""}
${(day.muscle != null || day.fatpct != null) ? `- 体組成：体重${day.weight ?? "—"}kg／骨格筋量${day.muscle ?? "—"}kg／体脂肪率${day.fatpct ?? "—"}%（維持目標。骨格筋量の減少傾向にだけ注意を払う）
` : ""}- 毎日ケア（手首+下半身10分）：${day.care ? "実施" : "記録なし"}${day.wrist ? `／翌朝の手首：${day.wrist==="ok"?"違和感なし":"違和感あり"}` : ""}
- 食べたもの：${foodList}
- 直近7日平均：${weekAvgFor(new Date(y, m - 1, d)) ?? "—"}g
- 今週の食材ペース：鯖缶${pc.saba}/3、生魚${pc.fish}/1、ツナ${pc.tuna}/2、赤身${pc.red}/1、貝${pc.shell}/1

出力：日本語で2〜3文の一言評価のみ。前置き・見出し・絵文字・マークダウン不要。`} ],
  });
  return raw.trim();
}

// InBody等のスクショから体組成を読み取る
async function extractBodyComp(base64, mediaType) {
  const raw = await callApi({
    model: MODEL_PHOTO, max_tokens: 300,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text:
`この体組成計アプリのスクリーンショットから数値を読み取ってください。
- weight: 体重(kg)
- muscle: 骨格筋量(kg)
- fatpct: 体脂肪率(%)
読み取れない項目はnull。出力はJSONオブジェクトのみ：{"weight":数値orNull,"muscle":数値orNull,"fatpct":数値orNull}
前置き・説明・コードフェンス不要。` },
    ] }],
  });
  const o = JSON.parse(raw.replace(/```json|```/g, "").trim());
  const num = (v) => (v == null || isNaN(Number(v))) ? null : Math.round(Number(v) * 10) / 10;
  return { weight: num(o.weight), muscle: num(o.muscle), fatpct: num(o.fatpct) };
}

// 写真を縮小してbase64化（通信量・コスト対策）
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (Math.max(width, height) > MAX) {
        const r = MAX / Math.max(width, height);
        width = Math.round(width * r); height = Math.round(height * r);
      }
      const cv = document.createElement("canvas");
      cv.width = width; cv.height = height;
      cv.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = cv.toDataURL("image/jpeg", 0.82);
      resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image load failed")); };
    img.src = url;
  });
}

// ---------- CSV / バックアップ ----------
function buildCsv() {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["日付","区分","品名","たんぱく質g","糖質g","緑黄色野菜","オメガ3","食物繊維","食材カテゴリ","日合計P","日合計C","睡眠h","体重kg","骨格筋量kg","体脂肪率","食後散歩"].join(",")];
  for (const k of Object.keys(data).sort()) {
    const dd = data[k];
    if (!dd || !(dd.foods || []).length) continue;
    const dp = sumP(dd), dc = sumC(dd);
    dd.foods.forEach((f, i) => {
      rows.push([k, (DAY_LABEL[dd.dayType] || "休養"), q(f.name), f.p ?? 0, f.c ?? 0,
        f.veg ? 1 : 0, f.omega3 ? 1 : 0, f.fiber ? 1 : 0, f.cat || "",
        i === 0 ? dp : "", i === 0 ? dc : "",
        i === 0 ? (dd.sleep ?? "") : "", i === 0 ? (dd.weight ?? "") : "", i === 0 ? (dd.muscle ?? "") : "", i === 0 ? (dd.fatpct ?? "") : "", i === 0 ? (dd.walked ? 1 : 0) : ""].join(","));
    });
  }
  return rows.join("\n");
}
function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
const exportCsv = () => download(`mealog_${toKey(new Date())}.csv`, "\uFEFF" + buildCsv(), "text/csv;charset=utf-8");
const exportJson = () => download(`mealog_backup_${toKey(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
function importJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (typeof obj !== "object" || !obj) throw new Error();
      if (confirm("バックアップから復元します。現在のデータに上書きマージされます。よろしいですか？")) {
        data = Object.assign({}, data, obj);
        save(); setMsg = "復元しました。"; render();
      }
    } catch (e) { alert("ファイルを読み込めませんでした。"); }
  };
  r.readAsText(file);
}

// ---------- アクション ----------
async function submitText() {
  const t = inputText.trim();
  if (!t || busy) return;
  if (!apiKey()) { errMsg = "APIキーが未登録です。設定タブで登録すると送信できます。"; render(); return; }
  busy = true; errMsg = ""; render();
  try {
    const items = await estimateNutrition(t);
    if (!items.length) errMsg = "うまく読み取れませんでした。言い方を変えて試してください。";
    else {
      const key = toKey(cursor);
      const day = getDay(key);
      inputText = "";
      updateDay(key, { foods: day.foods.concat(items), comment: null });
    }
  } catch (e) {
    errMsg = e.message === "NO_KEY" ? "設定タブでAPIキーを登録してください。" : "概算に失敗しました。通信とAPIキーを確認してください。";
  } finally { busy = false; render(); }
}

async function onPhotoPicked(file) {
  if (!file || busy) return;
  if (!apiKey()) { errMsg = "APIキーが未登録です。設定タブで登録すると写真解析が使えます。"; render(); return; }
  busy = true; errMsg = ""; render();
  try {
    const { base64, mediaType } = await resizeImage(file);
    const items = await estimateFromPhoto(base64, mediaType, inputText.trim());
    if (!items.length) errMsg = "写真から品目を読み取れませんでした。テキストで補足してみてください。";
    else {
      const key = toKey(cursor);
      const day = getDay(key);
      inputText = "";
      updateDay(key, { foods: day.foods.concat(items), comment: null });
    }
  } catch (e) { errMsg = "写真の解析に失敗しました。もう一度試してください。"; }
  finally { busy = false; render(); }
}

async function getBakao() {
  const key = toKey(cursor);
  if (commentBusy || !getDay(key).foods.length) return;
  if (!apiKey()) { errMsg = "APIキーが未登録です。設定タブで登録すると評価が使えます。"; render(); return; }
  commentBusy = true; errMsg = ""; render();
  try {
    const c = await fetchBakao(key);
    if (c) updateDay(key, { comment: c });
  } catch (e) { errMsg = "評価の取得に失敗しました。"; }
  finally { commentBusy = false; render(); }
}

async function onInbodyPicked(file) {
  if (!file || busy) return;
  if (!apiKey()) { errMsg = "APIキーが未登録です。設定タブで登録すると読み取りが使えます。"; render(); return; }
  busy = true; errMsg = ""; render();
  try {
    const { base64, mediaType } = await resizeImage(file);
    const r = await extractBodyComp(base64, mediaType);
    if (r.weight == null && r.muscle == null && r.fatpct == null) {
      errMsg = "数値を読み取れませんでした。数値が写った画面で撮り直してみてください。";
    } else {
      const key = toKey(cursor);
      const patch = {};
      if (r.weight != null) patch.weight = String(r.weight);
      if (r.muscle != null) patch.muscle = r.muscle;
      if (r.fatpct != null) patch.fatpct = r.fatpct;
      updateDay(key, patch);
    }
  } catch (e) { errMsg = "読み取りに失敗しました。もう一度試してください。"; }
  finally { busy = false; render(); }
}

function removeFood(i) {
  const key = toKey(cursor);
  const day = getDay(key);
  updateDay(key, { foods: day.foods.filter((_, idx) => idx !== i), comment: null });
}

// ---------- 描画 ----------
function render() {
  const app = $("#app");
  app.innerHTML = `
    <div class="tabs">
      ${[["log","記録"],["review","振り返り"],["settings","設定"]].map(([v,l]) =>
        `<button class="tab ${view===v?"on":""}" data-view="${v}">${l}</button>`).join("")}
    </div>
    ${view === "log" ? renderLog() : view === "review" ? renderReview() : renderSettings()}
  `;
  bindEvents();
}

function renderLog() {
  const key = toKey(cursor);
  const day = getDay(key);
  const total = sumP(day), carbs = sumC(day);
  const target = isActive(day.dayType) ? CEILING : FLOOR;
  const isToday = toKey(new Date()) === key;
  const hitFloor = total >= FLOOR, hitCeil = total >= CEILING;
  const barColor = hitCeil ? "var(--amber)" : hitFloor ? "var(--green)" : "var(--ice)";
  const pct = Math.min(total / CEILING, 1) * 100;
  const floorPct = (FLOOR / CEILING) * 100;
  const carbLimit = CARB_LIMIT[isActive(day.dayType) ? "active" : "rest"];
  const carbHot = carbs >= carbLimit && !day.walked;
  const hasVeg = day.foods.some((f) => f.veg);
  const hasOm = day.foods.some((f) => f.omega3);
  const hasFi = day.foods.some((f) => f.fiber);
  const wavg = weekAvgFor(cursor);
  const pc = pace7(key);

  return `
    <div class="datenav">
      <button class="navbtn" data-move="-1">‹</button>
      <div>
        <div class="datetitle">${fmtJP(cursor)}</div>
        ${!isToday ? `<button class="todaybtn" data-today>今日へ戻る</button>` : ""}
      </div>
      <button class="navbtn" data-move="1" ${isToday ? "disabled" : ""}>›</button>
    </div>

    <div class="daytype daytype5">
      ${["rest","trainA","trainB","climb","mountain"].map((t) =>
        `<button class="dt ${t==="rest"?"rest":"active"} ${day.dayType===t?"on":""}" data-daytype="${t}">${DAY_LABEL[t]}</button>`).join("")}
    </div>
    <div class="hint" style="margin-top:-8px;margin-bottom:8px">${isActive(day.dayType)?"運動日 · 目標120g":"休養日 · 基準100g"}</div>

    ${MENU[day.dayType] ? `
    <div class="section" style="padding-top:0;padding-bottom:14px">
      <div class="seclabel">今日のメニュー（${DAY_LABEL[day.dayType]}）</div>
      <div class="card pacebox">
        ${MENU[day.dayType].map((ex) => {
          const on = ((day.workout && day.workout.checks) || []).includes(ex.id);
          return `<div class="pacerow" data-ex="${ex.id}" style="cursor:pointer">
            <span class="box" style="width:18px;height:18px;border-radius:5px;border:1.5px solid var(--green);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;${on?"background:var(--green);color:var(--bg)":""}">${on?"✓":""}</span>
            <span style="font-size:14px;flex:1;color:${on?"var(--text)":"var(--muted)"}">${ex.name}</span>
            <span style="font-size:11px;color:var(--muted);flex-shrink:0" class="mono">${ex.spec}</span>
          </div>`;
        }).join("")}
      </div>
      <input class="setinput" data-wnote placeholder="メモ（例：RDL 18kgに上げた／スイング違和感で中止）"
        value="${esc((day.workout && day.workout.note) || "")}" style="margin-top:8px;font-size:13px">
    </div>` : ""}

    ${(() => {
      const yd = new Date(cursor); yd.setDate(yd.getDate() - 1);
      const ydd = data[toKey(yd)];
      if (!ydd || !MENU[ydd.dayType]) return "";
      return `<div class="section" style="padding-top:0;padding-bottom:14px">
        <div class="card" style="padding:12px 14px;border-color:${day.wrist==="ng"?"var(--amber)":"var(--line)"}">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">昨日は${DAY_LABEL[ydd.dayType]}。翌朝の手首は？</div>
          <div style="display:flex;gap:8px">
            <button class="dt ${day.wrist==="ok"?"rest on":"rest"}" data-wrist="ok" style="padding:8px 0">違和感なし</button>
            <button class="dt ${day.wrist==="ng"?"active on":"active"}" data-wrist="ng" style="padding:8px 0">違和感あり</button>
          </div>
          ${day.wrist==="ng"?`<div style="font-size:11px;color:var(--amber);margin-top:8px">判断基準：一段戻す（重量↓ or テンポ段階↓）。2回続いたら2割減。</div>`:""}
          ${day.wrist==="ok"?`<div style="font-size:11px;color:var(--green);margin-top:8px">前進OK。テンポ→ポーズ→片側化→回数の順で。</div>`:""}
        </div>
      </div>`;
    })()}

    <div class="gaugewrap">
      <div class="gauge">
        <div class="tube"><div class="fill" style="height:${pct}%;background:linear-gradient(180deg,${barColor},${barColor})"></div></div>
        <div class="floorline" style="bottom:${floorPct}%"></div>
        <div class="ceilline"></div>
      </div>
      <div class="gmain">
        <div class="glabel">たんぱく質</div>
        <div><span class="gnum mono" style="color:${barColor}">${total}</span><span class="gunit mono"> g</span></div>
        <div class="gtarget">今日の目標 ${target}g（${DAY_LABEL[day.dayType]||"休養"}）</div>
        <div class="statusrow">
          <span class="box" style="border-color:var(--green);${hitFloor?"background:var(--green);color:var(--bg)":""}">${hitFloor?"✓":""}</span>
          <span>基準 100g</span>
          <span class="detail mono" style="color:${hitFloor?"var(--green)":"var(--muted)"}">${hitFloor?"到達 · 合格":`あと ${FLOOR-total}g`}</span>
        </div>
        <div class="statusrow" style="opacity:${isActive(day.dayType)?1:.5}">
          <span class="box" style="border-color:var(--amber);${hitCeil?"background:var(--amber);color:var(--bg)":""}">${hitCeil?"✓":""}</span>
          <span>運動日目標 120g</span>
          <span class="detail mono" style="color:${hitCeil?"var(--amber)":"var(--muted)"}">${hitCeil?"到達":`あと ${CEILING-total}g`}</span>
        </div>
        ${wavg != null ? `<div class="weekavg">直近7日平均　<span class="mono" style="color:var(--text);font-size:14px">${wavg}g</span></div>` : ""}
      </div>
    </div>

    <div class="card carbcard ${carbHot?"hot":""}">
      <div>
        <div style="font-size:12px;color:var(--muted)">糖質（目安 ${carbLimit}g／${isActive(day.dayType)?"運動日":"休養日"}）</div>
        ${carbHot ? `<div style="font-size:11px;color:var(--amber);margin-top:3px">目安超え。食後の散歩がおすすめ。</div>` : ""}
      </div>
      <div><span class="mono" style="font-size:26px;font-weight:700;color:${carbHot?"var(--amber)":"var(--text)"}">${carbs}</span><span class="mono" style="font-size:13px;color:var(--muted)"> g</span></div>
    </div>

    <div class="pills">
      <div class="pill ${hasVeg?"on":""}"><span class="ico">🥬</span>緑黄色野菜</div>
      <div class="pill ${hasOm?"on":""}"><span class="ico">🐟</span>魚 オメガ3</div>
      <div class="pill ${hasFi?"on":""}"><span class="ico">🌾</span>食物繊維</div>
    </div>

    <div class="section">
      <div class="seclabel">今週の食材ペース（直近7日）</div>
      <div class="card pacebox">
        ${PACE.map((row) => {
          const n = pc[row.key], met = n >= row.target;
          const dots = Array.from({ length: Math.max(row.target, n) }).map((_, i) =>
            `<span class="dot" style="${i < n ? `background:${row.color};border-color:${row.color}` : i < row.target ? `border-color:${row.color}` : "opacity:.4"}"></span>`).join("");
          return `<div class="pacerow">
            <span class="pacename">${row.label}</span>
            <div class="dots">${dots}</div>
            <span class="pacestat mono ${met?"met":""}">${met?`達成 ${n}/${row.target}`:`${n}/${row.target}・あと${row.target-n}`}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="pacenote">目安：鯖缶3・生魚1〜2・ツナ2〜3・赤身1・貝1／週</div>
    </div>

    <div class="inputrow">
      <button class="iconbtn" data-photo ${busy?"disabled":""}>📷</button>
      <textarea class="mealinput" rows="2" placeholder="食べたものを書く／写真だけでもOK" ${busy?"disabled":""}>${esc(inputText)}</textarea>
      <button class="sendbtn" data-send ${busy?"disabled":""}>${busy?'<span class="spin">◐</span>':"⏎"}</button>
    </div>
    <div class="hint">${busy ? "解析中…" : apiKey() ? "AIが自動概算します。g数を書けばその値を優先。" : "AI概算には設定タブでAPIキー登録が必要です。"}</div>
    ${errMsg ? `<div class="errmsg">${esc(errMsg)}</div>` : ""}

    <div class="foodlist">
      ${day.foods.length === 0
        ? `<div class="emptymsg">まだ記録がありません。写真か一言でどうぞ。</div>`
        : day.foods.map((f, i) => `
          <div class="foodrow">
            <div class="foodname"><span class="nm">${esc(f.name)}</span><span class="badges">${f.veg?"🥬":""}${f.omega3?"🐟":""}${f.fiber?"🌾":""}</span></div>
            <div class="foodnums">
              <span class="mono" style="color:var(--ice);font-size:15px">${f.p}<small style="color:var(--muted)">P</small></span>
              <span class="mono" style="color:var(--muted);font-size:13px">${f.c ?? 0}<small>C</small></span>
              <button class="delbtn" data-del="${i}">🗑</button>
            </div>
          </div>`).join("")}
    </div>

    ${day.foods.length ? `
      <div class="bakaobox">
        ${day.comment ? `
          <div class="bakaocard">
            <div class="bakaotitle">🥗 ばかおの一言</div>
            <div class="bakaotext">${esc(day.comment)}</div>
            <button class="linkbtn" data-bakao>${commentBusy?"更新中…":"評価を更新"}</button>
          </div>` : `
          <button class="bakaobtn" data-bakao ${commentBusy?"disabled":""}>${commentBusy?'<span class="spin">◐</span> ばかおが見ています…':"💬 ばかおの一言評価をもらう"}</button>`}
      </div>` : ""}

    <div class="tiles">
      <div class="tile">
        <span class="ico">🌙</span>
        <input class="tileinput mono" data-field="sleep" inputmode="decimal" placeholder="—" value="${day.sleep ?? ""}">
        <span class="tilelabel">睡眠 h</span>
      </div>
      <div class="tile">
        <span class="ico">⚖️</span>
        <input class="tileinput mono" data-field="weight" inputmode="decimal" placeholder="—" value="${day.weight ?? ""}">
        <span class="tilelabel">体重 kg</span>
      </div>
      <button class="tile ${day.care?"on":""}" data-care style="cursor:pointer;border:1px solid ${day.care?"var(--green)":"var(--line)"}">
        <span class="ico">🤲</span>
        <span class="mono" style="font-size:15px;font-weight:700;color:${day.care?"var(--green)":"var(--muted)"}">${day.care?"✓":"—"}</span>
        <span class="tilelabel">毎日ケア</span>
      </button>
      <button class="tile ${day.walked?"on":""}" data-walk style="cursor:pointer;border:1px solid ${day.walked?"var(--green)":"var(--line)"}">
        <span class="ico">👣</span>
        <span class="mono" style="font-size:15px;font-weight:700;color:${day.walked?"var(--green)":"var(--muted)"}">${day.walked?"✓":"—"}</span>
        <span class="tilelabel">食後散歩</span>
      </button>
    </div>
    ${day.walked ? `<div class="walknote">食後の散歩は食後血糖の面でプラス。</div>` : ""}

    <div class="section" style="padding-bottom:8px">
      <div class="seclabel">体組成（InBody等のスクショから）</div>
      <div class="card" style="margin-top:10px;padding:12px 14px;display:flex;align-items:center;gap:12px">
        <button class="iconbtn" data-inbody ${busy?"disabled":""} style="width:44px;height:44px">📊</button>
        <div style="flex:1;font-size:13px;color:var(--muted)">
          ${(day.muscle != null || day.fatpct != null)
            ? `<span style="color:var(--text)">筋量 <b class="mono" style="color:var(--green)">${day.muscle ?? "—"}</b>kg ・ 体脂肪 <b class="mono" style="color:var(--ice)">${day.fatpct ?? "—"}</b>%</span>`
            : "測定結果のスクショを選ぶと、体重・筋量・体脂肪率を自動で記録します。"}
        </div>
      </div>
    </div>
  `;
}

function renderReview() {
  const today = new Date();
  const days = [];
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const k = toKey(d), dd = data[k];
    days.push({
      key: k, label: `${d.getMonth()+1}/${d.getDate()}`,
      p: sumP(dd), c: sumC(dd), has: !!(dd && dd.foods.length),
      dayType: (dd && dd.dayType) || "rest", walked: !!(dd && dd.walked),
      weight: dd && dd.weight ? Number(dd.weight) : null,
      muscle: dd && dd.muscle != null ? Number(dd.muscle) : null,
      fatpct: dd && dd.fatpct != null ? Number(dd.fatpct) : null,
      veg: !!((dd && dd.foods) || []).some((f) => f.veg),
      omega3: !!((dd && dd.foods) || []).some((f) => f.omega3),
      fiber: !!((dd && dd.foods) || []).some((f) => f.fiber),
    });
  }
  const logged = days.filter((x) => x.has);
  const avgP = logged.length ? Math.round(logged.reduce((s, x) => s + x.p, 0) / logged.length) : 0;
  const floorDays = logged.filter((x) => x.p >= FLOOR).length;
  const walkDays = days.filter((x) => x.walked).length;
  const om3Days = days.filter((x) => x.omega3).length;
  const vegDays = days.filter((x) => x.veg).length;
  const fiDays = days.filter((x) => x.fiber).length;

  return `
    <div class="rangebtns">
      <button class="rbtn ${range===14?"on":""}" data-range="14">2週間</button>
      <button class="rbtn ${range===30?"on":""}" data-range="30">1ヶ月</button>
      <button class="csvbtn" data-csv>⬇ CSV</button>
    </div>
    <div class="sumgrid">
      <div class="sumcard"><div class="sumlabel">平均たんぱく質</div><div><span class="sumval mono" style="color:${avgP>=FLOOR?"var(--green)":"var(--ice)"}">${avgP}</span><span class="sumunit mono"> g</span></div><div class="sumnote">記録 ${logged.length}日</div></div>
      <div class="sumcard"><div class="sumlabel">基準100g 達成</div><div><span class="sumval mono" style="color:var(--green)">${floorDays}</span><span class="sumunit mono">/${logged.length}日</span></div><div class="sumnote">合格した日数</div></div>
      <div class="sumcard"><div class="sumlabel">食後散歩</div><div><span class="sumval mono" style="color:var(--ice)">${walkDays}</span><span class="sumunit mono"> 日</span></div><div class="sumnote">血糖対策</div></div>
      <div class="sumcard"><div class="sumlabel">魚(オメガ3)</div><div><span class="sumval mono" style="color:var(--ice)">${om3Days}</span><span class="sumunit mono"> 日</span></div><div class="sumnote">緑黄${vegDays}·繊維${fiDays}日</div></div>
    </div>
    <div class="chartbox">
      <div class="seclabel">たんぱく質の推移</div>
      ${proteinChart(days)}
      <div class="chartnote">緑の破線＝基準100g／橙線＝運動日目標120g</div>
    </div>
    <div class="chartbox">
      <div class="seclabel">⚖️ 体重の推移</div>
      ${weightChart(days)}
    </div>
    <div class="chartbox">
      <div class="seclabel">💪 骨格筋量の推移</div>
      ${compChart(days, "muscle", "#7FD68B", "kg")}
    </div>
    <div class="chartbox">
      <div class="seclabel">体脂肪率の推移</div>
      ${compChart(days, "fatpct", "#F0B458", "%")}
    </div>
    <div class="section" style="padding-top:0">
      <div class="seclabel">日別ログ</div>
      <div class="daylist">
        ${days.slice().reverse().map((x) => `
          <div class="dayrow ${x.has?"":"off"}">
            <span class="daydate mono">${x.label}</span>
            ${DAY_SHORT[x.dayType]?`<span class="daybadge">${DAY_SHORT[x.dayType]}</span>`:""}
            <span class="dayicons">${x.veg?"🥬":""}${x.omega3?"🐟":""}${x.fiber?"🌾":""}${x.walked?"👣":""}</span>
            <span class="dayp mono" style="color:${!x.has?"var(--muted)":x.p>=CEILING?"var(--amber)":x.p>=FLOOR?"var(--green)":"var(--ice)"}">${x.has?x.p+"g":"—"}</span>
          </div>`).join("")}
      </div>
    </div>
  `;
}

function proteinChart(days) {
  const W = 448, H = 180, padL = 30, padB = 18, padT = 8;
  const maxY = 140;
  const iw = (W - padL) / days.length;
  const y = (v) => padT + (H - padT - padB) * (1 - Math.min(v, maxY) / maxY);
  const bars = days.map((d, i) => {
    const x = padL + i * iw + iw * 0.15;
    const bw = iw * 0.7;
    const v = d.has ? d.p : 0;
    const color = v >= CEILING ? "#F0B458" : v >= FLOOR ? "#7FD68B" : v > 0 ? "#5FC9DE" : "#22303C";
    const h = (H - padT - padB) * (Math.min(v, maxY) / maxY);
    return `<rect x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h,1).toFixed(1)}" rx="2" fill="${color}"/>`;
  }).join("");
  const step = days.length > 20 ? 5 : days.length > 10 ? 2 : 1;
  const labels = days.map((d, i) => i % step === 0
    ? `<text x="${(padL + i * iw + iw/2).toFixed(1)}" y="${H-4}" font-size="9" fill="#8598A6" text-anchor="middle">${d.label}</text>` : "").join("");
  const axis = [0, 50, 100, 140].map((v) =>
    `<text x="${padL-5}" y="${(y(v)+3).toFixed(1)}" font-size="9" fill="#8598A6" text-anchor="end">${v}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px">
    ${axis}${bars}
    <line x1="${padL}" x2="${W}" y1="${y(FLOOR).toFixed(1)}" y2="${y(FLOOR).toFixed(1)}" stroke="#7FD68B" stroke-width="1.5" stroke-dasharray="4 3"/>
    <line x1="${padL}" x2="${W}" y1="${y(CEILING).toFixed(1)}" y2="${y(CEILING).toFixed(1)}" stroke="#F0B458" stroke-width="1.5"/>
    ${labels}
  </svg>`;
}

function weightChart(days) {
  const pts = days.filter((d) => d.weight != null);
  if (pts.length < 2) return `<div style="font-size:12px;color:var(--muted);padding:14px 0">体重の記録が2日分たまるとグラフが出ます。</div>`;
  const W = 448, H = 150, padL = 34, padB = 18, padT = 10;
  const ws = pts.map((p) => p.weight);
  const lo = Math.min(...ws) - 1, hi = Math.max(...ws) + 1;
  const x = (i) => padL + (W - padL - 8) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.weight).toFixed(1)}" r="3" fill="#5FC9DE"/>`).join("");
  const labels = pts.map((p, i) => (pts.length <= 8 || i === 0 || i === pts.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H-4}" font-size="9" fill="#8598A6" text-anchor="middle">${p.label}</text>` : "").join("");
  const axis = [lo, (lo+hi)/2, hi].map((v) =>
    `<text x="${padL-5}" y="${(y(v)+3).toFixed(1)}" font-size="9" fill="#8598A6" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px">
    ${axis}<path d="${path}" fill="none" stroke="#5FC9DE" stroke-width="2"/>${dots}${labels}
  </svg>`;
}

function compChart(days, field, color, unit) {
  const pts = days.filter((d) => d[field] != null);
  if (pts.length < 2) return `<div style="font-size:12px;color:var(--muted);padding:14px 0">記録が2回分たまるとグラフが出ます（${unit}）。</div>`;
  const W = 448, H = 140, padL = 36, padB = 18, padT = 10;
  const vs = pts.map((p) => p[field]);
  const lo = Math.min(...vs) - 0.5, hi = Math.max(...vs) + 0.5;
  const x = (i) => padL + (W - padL - 8) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[field]).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p[field]).toFixed(1)}" r="3" fill="${color}"/>`).join("");
  const labels = pts.map((p, i) => (pts.length <= 8 || i === 0 || i === pts.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H-4}" font-size="9" fill="#8598A6" text-anchor="middle">${p.label}</text>` : "").join("");
  const axis = [lo, (lo+hi)/2, hi].map((v) =>
    `<text x="${padL-5}" y="${(y(v)+3).toFixed(1)}" font-size="9" fill="#8598A6" text-anchor="end">${v.toFixed(1)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px">
    ${axis}<path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>${dots}${labels}
  </svg>`;
}

function renderSettings() {
  const hasKey = !!apiKey();
  return `
    <div class="section" style="padding-top:4px">
      <div class="card setbox">
        <div class="settitle">🔑 Anthropic APIキー（AI概算・ばかお評価用）</div>
        <div class="setdesc">
          写真解析・自動概算・ばかおの一言に使います。キーは<b>この端末の中にだけ</b>保存され、外部には送信されません（Anthropicへの通信を除く）。<br>
          取得：console.anthropic.com → API Keys → Create Key。従量課金ですが1回の概算は1円未満〜数円程度です。
        </div>
        <div style="font-size:12px;margin-bottom:8px;color:${hasKey?"var(--green)":"var(--amber)"}">現在：${hasKey ? "登録済み ✓" : "未登録（AI概算・写真解析・ばかお評価は使えません）"}</div>
        <input class="setinput mono" id="apikeyInput" type="password" placeholder="sk-ant-..." value="${hasKey ? "●●●●●●●●●●●●" : ""}">
        <div class="setrow">
          <button class="setbtn" data-savekey>保存してテスト</button>
          ${hasKey ? `<button class="setbtn danger" data-delkey>キーを削除</button>` : ""}
        </div>
        ${setMsg ? `<div class="okmsg">${esc(setMsg)}</div>` : ""}
      </div>

      <div class="card setbox">
        <div class="settitle">💾 バックアップ</div>
        <div class="setdesc">データはこの端末のブラウザ内に保存されています。ブラウザのデータ消去で消えるので、ときどき書き出しておくと安心です。</div>
        <div class="setrow">
          <button class="setbtn ghost" data-exportjson>JSONで書き出し</button>
          <button class="setbtn ghost" data-importjson>JSONから復元</button>
          <button class="setbtn ghost" data-exportcsv>CSVで書き出し</button>
        </div>
      </div>

      <div class="card setbox">
        <div class="settitle">ℹ️ このアプリについて</div>
        <div class="setdesc">
          foodlog — たんぱく質 基準100g／運動日目標120g方式の食事＋筋トレログ。<br>筋トレ：週2（A=ヒンジ・脚／B=引く・押す・体幹）＋毎日ケア10分。翌朝の手首で前進/一段戻すを判定。<br>
          糖質目安：休養日250g・運動日330g（血糖対策は質とタイミングで）。食材ペース：鯖缶3・生魚1〜2・ツナ2〜3・赤身1・貝1／週。<br>
          データ保存：この端末のみ（サーバーには何も送りません）。
        </div>
      </div>
    </div>
  `;
}

// ---------- イベント ----------
function bindEvents() {
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => { view = b.dataset.view; errMsg = ""; setMsg = ""; render(); }));

  document.querySelectorAll("[data-move]").forEach((b) =>
    b.addEventListener("click", () => { const d = new Date(cursor); d.setDate(d.getDate() + Number(b.dataset.move)); cursor = d; errMsg = ""; render(); }));
  const tb = $("[data-today]"); if (tb) tb.addEventListener("click", () => { cursor = new Date(); render(); });

  document.querySelectorAll("[data-daytype]").forEach((b) =>
    b.addEventListener("click", () => updateDay(toKey(cursor), { dayType: b.dataset.daytype })));

  const ta = $(".mealinput");
  if (ta) {
    ta.addEventListener("input", () => { inputText = ta.value; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitText(); });
  }
  const send = $("[data-send]"); if (send) send.addEventListener("click", submitText);
  const photo = $("[data-photo]"); if (photo) photo.addEventListener("click", () => $("#photoInput").click());
  const ib = $("[data-inbody]"); if (ib) ib.addEventListener("click", () => $("#inbodyInput").click());

  document.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => removeFood(Number(b.dataset.del))));

  const bk = $("[data-bakao]"); if (bk) bk.addEventListener("click", getBakao);

  document.querySelectorAll("[data-field]").forEach((inp) =>
    inp.addEventListener("change", () => {
      const v = inp.value.replace(/[^0-9.]/g, "");
      updateDay(toKey(cursor), { [inp.dataset.field]: v || null });
    }));
  const walk = $("[data-walk]"); if (walk) walk.addEventListener("click", () => {
    const key = toKey(cursor);
    updateDay(key, { walked: !getDay(key).walked });
  });
  const care = $("[data-care]"); if (care) care.addEventListener("click", () => {
    const key = toKey(cursor);
    updateDay(key, { care: !getDay(key).care });
  });
  document.querySelectorAll("[data-ex]").forEach((row) =>
    row.addEventListener("click", () => {
      const key = toKey(cursor);
      const day = getDay(key);
      const w = Object.assign({ checks: [], note: "" }, day.workout || {});
      const id = row.dataset.ex;
      w.checks = w.checks.includes(id) ? w.checks.filter((x) => x !== id) : w.checks.concat(id);
      updateDay(key, { workout: w });
    }));
  const wn = $("[data-wnote]"); if (wn) {
    wn.addEventListener("change", () => {
      const key = toKey(cursor);
      const day = getDay(key);
      updateDay(key, { workout: Object.assign({ checks: [] }, day.workout || {}, { note: wn.value }) });
    });
  }
  document.querySelectorAll("[data-wrist]").forEach((b) =>
    b.addEventListener("click", () => {
      const key = toKey(cursor);
      const cur = getDay(key).wrist;
      updateDay(key, { wrist: cur === b.dataset.wrist ? null : b.dataset.wrist });
    }));

  document.querySelectorAll("[data-range]").forEach((b) =>
    b.addEventListener("click", () => { range = Number(b.dataset.range); render(); }));
  const csv = $("[data-csv]"); if (csv) csv.addEventListener("click", exportCsv);

  const sk = $("[data-savekey]"); if (sk) sk.addEventListener("click", async () => {
    const v = $("#apikeyInput").value.trim();
    if (!v || v.startsWith("●")) { setMsg = "キーを入力してください。"; render(); return; }
    localStorage.setItem(API_KEY_KEY, v);
    setMsg = "テスト中…"; render();
    try {
      await callApi({ model: MODEL_TEST, max_tokens: 10, messages: [{ role: "user", content: "1+1=" }] });
      setMsg = "保存しました。AI機能が使えます。";
    } catch (e) {
      setMsg = "保存しましたが、テストに失敗しました（" + e.message + "）。通信状況か、キーが正しいか確認してください。";
    }
    render();
  });
  const dk = $("[data-delkey]"); if (dk) dk.addEventListener("click", () => {
    if (confirm("APIキーを削除しますか？")) { localStorage.removeItem(API_KEY_KEY); setMsg = "削除しました。"; render(); }
  });

  const ej = $("[data-exportjson]"); if (ej) ej.addEventListener("click", exportJson);
  const ec = $("[data-exportcsv]"); if (ec) ec.addEventListener("click", exportCsv);
  const ij = $("[data-importjson]"); if (ij) ij.addEventListener("click", () => $("#importInput").click());
}

// 写真・インポートのファイル選択（一度だけバインド）
document.getElementById("photoInput").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  onPhotoPicked(f);
});
// InBodyスクショ用の隠しinputを動的に用意（index.html変更を不要にするため）
(() => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.id = "inbodyInput"; inp.style.display = "none";
  document.body.appendChild(inp);
  inp.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    onInbodyPicked(f);
  });
})();

document.getElementById("importInput").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (f) importJson(f);
});

// 追加スタイル（5択トグル・4タイル対応）
(() => {
  const st = document.createElement("style");
  st.textContent = `
    .daytype5 { flex-wrap: wrap; }
    .daytype5 .dt { flex: 1 1 30%; padding: 9px 0; font-size: 12.5px; }
    .tiles { display: grid !important; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .tile { padding: 12px 2px; }
    .tilelabel { font-size: 10px; }
  `;
  document.head.appendChild(st);
})();

// Service Worker登録（オフライン起動用）
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// 起動
load();
// データのある最新日か今日のうち、新しい方を開く
(() => {
  const todayKey = toKey(new Date());
  const dated = Object.keys(data).filter((k) => (data[k].foods || []).length).sort();
  const latest = dated[dated.length - 1];
  if (latest && latest > todayKey) {
    const [y, m, d] = latest.split("-").map(Number);
    cursor = new Date(y, m - 1, d);
  }
})();
render();
