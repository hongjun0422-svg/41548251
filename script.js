/**
 * 1인용 복용 관리 앱
 * @typedef {{ id: string; name: string; ingredients: string; dosage: string; times: string[] }} Vitamin
 * @typedef {{ enabled: boolean; intakeReminder: boolean; missedReminder: boolean; missedDelayMinutes: number }} NotifySettings
 */

/** @type {Vitamin[]} */
let VITAMINS = [];

/** 날짜별 복용 요약: dateKey → true(완료) | false(미복용) */
/** @type {Record<string, boolean>} */
const INTAKE_LOG = {};

/** @type {Record<string, boolean>} 슬롯 기록: "YYYY-MM-DD|vitaminId|HH:mm" */
const SLOT_LOG = {};

/** @type {NotifySettings} */
let NOTIFY_SETTINGS = {
  enabled: true,
  intakeReminder: true,
  missedReminder: true,
  missedDelayMinutes: 30,
};

/** @type {Record<string, string[]>} */
let NOTIFY_SENT_TODAY = {};

const _initial = new Date();
let viewYear = _initial.getFullYear();
let viewMonth = _initial.getMonth();

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const THEME_STORAGE_KEY = "vitaminTheme";
const VITAMIN_STORAGE_KEY = "vitaminRegistry";
const SLOT_LOG_KEY = "vitaminSlotLog";
const NOTIFY_SETTINGS_KEY = "vitaminNotifySettings";
const NOTIFY_SENT_KEY = "vitaminNotifySent";

/** @type {number[]} */
let NOTIFY_TIMERS = [];
let NOTIFY_DAY_KEY = toDateKey(new Date());

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @param {Date} d */
function toDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** @param {string} key */
function dateFromKey(key) {
  const [y, mo, day] = key.split("-").map(Number);
  return new Date(y, mo - 1, day);
}

/** @param {Date} d */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfToday() {
  return startOfDay(new Date());
}

/** @param {Date} d */
function isAfterToday(d) {
  return startOfDay(d) > startOfToday();
}

function purgeFutureIntakeLogs() {
  const t = startOfToday();
  for (const key of Object.keys(INTAKE_LOG)) {
    if (dateFromKey(key) > t) delete INTAKE_LOG[key];
  }
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** @param {string} raw */
function parseTimesInput(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return `${pad2(h)}:${pad2(m)}`;
    });
}

/** @param {string[]} times */
function formatTimes(times) {
  return times && times.length ? times.join(", ") : "09:00";
}

/** @param {string} dateKey @param {string} vitaminId @param {string} time */
function slotLogKey(dateKey, vitaminId, time) {
  return `${dateKey}|${vitaminId}|${time}`;
}

/** @param {string} time */
function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/** @returns {Vitamin[]} */
function defaultVitamins() {
  return [
    {
      id: uuid(),
      name: "종합비타민",
      dosage: "1정",
      ingredients: "비타민 A, B군, C, D, E, 미네랄",
      times: ["08:00"],
    },
    {
      id: uuid(),
      name: "유산균",
      dosage: "1캡슐",
      ingredients: "프로바이오틱스, 프리바이오틱스",
      times: ["21:00"],
    },
  ];
}

function loadVitamins() {
  try {
    const raw = localStorage.getItem(VITAMIN_STORAGE_KEY);
    if (!raw) {
      VITAMINS = defaultVitamins();
      saveVitamins();
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      VITAMINS = parsed
        .filter((x) => x && typeof x === "object")
        .map((x) => {
          const times = Array.isArray(x.times)
            ? x.times.filter((t) => /^\d{1,2}:\d{2}$/.test(String(t)))
            : parseTimesInput(x.times || "09:00");
          return {
            id: String(x.id || uuid()),
            name: String(x.name || ""),
            ingredients: String(x.ingredients || ""),
            dosage: String(x.dosage || ""),
            times: times.length
              ? times.map((t) => {
                  const [h, m] = String(t).split(":").map(Number);
                  return `${pad2(h)}:${pad2(m)}`;
                })
              : ["09:00"],
          };
        })
        .filter((x) => x.name && x.ingredients && x.dosage);
      return;
    }
  } catch {
    // ignore
  }
  VITAMINS = defaultVitamins();
  saveVitamins();
}

function saveVitamins() {
  try {
    localStorage.setItem(VITAMIN_STORAGE_KEY, JSON.stringify(VITAMINS));
  } catch {
    // ignore
  }
}

function loadSlotLog() {
  try {
    const raw = localStorage.getItem(SLOT_LOG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.keys(parsed).forEach((k) => {
        if (parsed[k]) SLOT_LOG[k] = true;
      });
    }
  } catch {
    // ignore
  }
}

function saveSlotLog() {
  try {
    localStorage.setItem(SLOT_LOG_KEY, JSON.stringify(SLOT_LOG));
  } catch {
    // ignore
  }
}

function loadNotifySettings() {
  try {
    const raw = localStorage.getItem(NOTIFY_SETTINGS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    NOTIFY_SETTINGS = {
      enabled: p.enabled !== false,
      intakeReminder: p.intakeReminder !== false,
      missedReminder: p.missedReminder !== false,
      missedDelayMinutes: Number(p.missedDelayMinutes) || 30,
    };
  } catch {
    // ignore
  }
}

function saveNotifySettings() {
  try {
    localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(NOTIFY_SETTINGS));
  } catch {
    // ignore
  }
}

function loadNotifySent() {
  const today = toDateKey(new Date());
  try {
    const raw = localStorage.getItem(NOTIFY_SENT_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    NOTIFY_SENT_TODAY = all[today] && Array.isArray(all[today]) ? { [today]: all[today] } : {};
  } catch {
    NOTIFY_SENT_TODAY = {};
  }
}

function saveNotifySent() {
  const today = toDateKey(new Date());
  try {
    const raw = localStorage.getItem(NOTIFY_SENT_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[today] = NOTIFY_SENT_TODAY[today] || [];
    localStorage.setItem(NOTIFY_SENT_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function markNotifySent(key) {
  const today = toDateKey(new Date());
  if (!NOTIFY_SENT_TODAY[today]) NOTIFY_SENT_TODAY[today] = [];
  if (!NOTIFY_SENT_TODAY[today].includes(key)) {
    NOTIFY_SENT_TODAY[today].push(key);
    saveNotifySent();
  }
}

function wasNotifySent(key) {
  const today = toDateKey(new Date());
  return (NOTIFY_SENT_TODAY[today] || []).includes(key);
}

/** @param {string} dateKey @param {string} vitaminId @param {string} time */
function isSlotTaken(dateKey, vitaminId, time) {
  return !!SLOT_LOG[slotLogKey(dateKey, vitaminId, time)];
}

/** @param {string} dateKey @param {string} vitaminId @param {string} time */
function setSlotTaken(dateKey, vitaminId, time, taken) {
  const key = slotLogKey(dateKey, vitaminId, time);
  if (taken) SLOT_LOG[key] = true;
  else delete SLOT_LOG[key];
  saveSlotLog();
  syncDayIntakeFromSlots(dateKey);
}

/**
 * @param {string} dateKey
 * @returns {{ vitamin: Vitamin; time: string }[]}
 */
function getAllSlots(dateKey) {
  const slots = [];
  VITAMINS.forEach((v) => {
    (v.times || ["09:00"]).forEach((time) => {
      slots.push({ vitamin: v, time });
    });
  });
  slots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return slots;
}

/** @param {string} dateKey @param {string} vitaminId @param {string} time */
function isSlotOverdue(dateKey, vitaminId, time) {
  if (dateKey !== toDateKey(new Date())) return false;
  if (isSlotTaken(dateKey, vitaminId, time)) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= timeToMinutes(time) + NOTIFY_SETTINGS.missedDelayMinutes;
}

/** @param {string} dateKey */
function syncDayIntakeFromSlots(dateKey) {
  const slots = getAllSlots(dateKey);
  if (slots.length === 0) {
    delete INTAKE_LOG[dateKey];
    return;
  }
  const allTaken = slots.every((s) => isSlotTaken(dateKey, s.vitamin.id, s.time));
  const anyMissed = slots.some((s) => isSlotOverdue(dateKey, s.vitamin.id, s.time));
  if (allTaken) INTAKE_LOG[dateKey] = true;
  else if (anyMissed) INTAKE_LOG[dateKey] = false;
  else delete INTAKE_LOG[dateKey];
}

/** @param {string} dateKey @returns {"ok"|"miss"|"none"} */
function getDayStatus(dateKey) {
  syncDayIntakeFromSlots(dateKey);
  if (!(dateKey in INTAKE_LOG)) return "none";
  return INTAKE_LOG[dateKey] ? "ok" : "miss";
}

/** @param {"ok"|"miss"|"none"} status */
function statusIconSvg(status) {
  if (status === "ok") {
    return `<svg class="state-ico state-ico--ok" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (status === "miss") {
    return `<svg class="state-ico state-ico--miss" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  }
  return `<svg class="state-ico state-ico--none" width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3.5 3"/></svg>`;
}

/** @param {"ok"|"miss"|"none"} s */
function labelStatus(s) {
  if (s === "ok") return "완료";
  if (s === "miss") return "미복용";
  return "기록 없음";
}

function ensureMonthSample(year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const today = startOfToday();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, monthIndex, day);
    const key = toDateKey(d);
    if (startOfDay(d) > today) {
      delete INTAKE_LOG[key];
      continue;
    }
    if (key in INTAKE_LOG) continue;
    const roll = day % 10;
    if (roll < 1) continue;
    INTAKE_LOG[key] = roll < 6;
  }
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function renderTodaySummary() {
  const el = document.getElementById("today-summary");
  if (!el) return;

  const key = toDateKey(new Date());
  const slots = getAllSlots(key);
  const taken = slots.filter((s) => isSlotTaken(key, s.vitamin.id, s.time)).length;
  const total = slots.length;
  const pct = total ? Math.round((taken / total) * 100) : 0;
  const status = getDayStatus(key);

  el.innerHTML = `
    <div class="today-summary__inner today-summary__inner--${status}">
      <div class="today-summary__progress" style="--pct:${pct}">
        <span class="today-summary__pct">${pct}%</span>
      </div>
      <div class="today-summary__meta">
        <p class="today-summary__label">오늘 복용 진행</p>
        <p class="today-summary__stat">${taken} / ${total} 완료</p>
        <p class="today-summary__status">${escapeHtml(labelStatus(status))}</p>
      </div>
    </div>`;
}

function renderDailySummary() {
  const dateEl = document.getElementById("daily-date");
  const listEl = document.getElementById("daily-list");
  if (!dateEl || !listEl) return;

  const now = new Date();
  dateEl.textContent = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${WEEKDAY_NAMES[now.getDay()]})`;

  const key = toDateKey(now);
  const slots = getAllSlots(key);

  if (slots.length === 0) {
    listEl.innerHTML = `<p class="daily-empty">등록된 영양제가 없습니다. 「영양제 등록」 탭에서 추가하세요.</p>`;
    renderTodaySummary();
    return;
  }

  const selectedValue = document.getElementById("dispense-slot")?.value || "";

  listEl.innerHTML = slots
    .map(({ vitamin: v, time }) => {
      const taken = isSlotTaken(key, v.id, time);
      const overdue = isSlotOverdue(key, v.id, time);
      const slotValue = `${v.id}|${time}`;
      const rowClass = taken ? "slot-row--ok" : overdue ? "slot-row--miss" : "slot-row--pending";
      const selectedClass = slotValue === selectedValue ? " slot-row--selected" : "";
      const statusHtml = taken
        ? `<span class="slot-status slot-status--done">완료</span>`
        : `<span class="slot-status slot-status--wait">AI 인증 필요</span>`;
      const tag = taken ? "div" : "button";
      const attrs = taken
        ? ""
        : ` type="button" data-dispense-slot data-vitamin-id="${escapeHtml(v.id)}" data-time="${escapeHtml(time)}" data-taken="false"`;
      const clickableClass = taken ? "" : " slot-row--clickable";
      return `<${tag} class="slot-row ${rowClass}${clickableClass}${selectedClass}"${attrs}>
        <div class="slot-row__info">
          <span class="slot-row__time">${escapeHtml(time)}</span>
          <span class="slot-row__name">${escapeHtml(v.name)}</span>
          <span class="slot-row__dose">${escapeHtml(v.dosage)}</span>
        </div>
        ${statusHtml}
      </${tag}>`;
    })
    .join("");

  renderTodaySummary();
}

function renderWeekdays() {
  const el = document.getElementById("weekdays");
  if (!el) return;
  el.innerHTML = WEEKDAY_LABELS.map((label, i) => {
    const weekend = i === 0 || i === 6 ? " weekday weekday--end" : " weekday";
    return `<div class="${weekend.trim()}"><span class="weekday__dot" aria-hidden="true"></span><span class="weekday__label">${label}</span></div>`;
  }).join("");
}

function isMobileCalendar() {
  return false;
}

function renderCellStatus(usersEl, ctx) {
  const { key, outside, futureInMonth, futurePadding, todayKey } = ctx;

  if (futureInMonth || futurePadding) {
    const note = document.createElement("div");
    note.className = "cell-future-note";
    note.textContent = "·";
    note.title = "예정";
    usersEl.appendChild(note);
    return;
  }

  const status = outside ? "none" : key === todayKey ? getDayStatus(key) : getDayStatus(key);
  const badge = document.createElement("div");
  badge.className = `cell-status cell-status--${status}`;
  badge.title = labelStatus(status);
  badge.setAttribute("aria-label", labelStatus(status));
  badge.innerHTML = statusIconSvg(status);
  usersEl.appendChild(badge);
}

function renderCalendar() {
  ensureMonthSample(viewYear, viewMonth);
  syncDayIntakeFromSlots(toDateKey(new Date()));

  const label = document.getElementById("month-label");
  if (label) {
    label.textContent = `${viewYear}년 ${viewMonth + 1}월`;
    label.className = "panel__title";
  }

  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  grid.classList.toggle("grid--compact", isMobileCalendar());
  grid.innerHTML = "";

  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const today = new Date();
  const todayKey = toDateKey(today);
  const isThisMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
  const prevMonthLast = daysInMonth(viewYear, viewMonth - 1);
  const cells = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: new Date(viewYear, viewMonth - 1, prevMonthLast - startWeekday + i + 1), outside: true });
  }
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ date: new Date(viewYear, viewMonth, day), outside: false });
  }
  const padEnd = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
  for (let i = 1; i <= padEnd; i++) {
    cells.push({ date: new Date(viewYear, viewMonth + 1, i), outside: true });
  }

  const frag = document.createDocumentFragment();
  cells.forEach(({ date, outside }) => {
    const key = toDateKey(date);
    const cell = document.createElement("div");
    cell.className = "cell" + (outside ? " cell--outside" : "");
    cell.setAttribute("role", "gridcell");

    const isToday =
      isThisMonth && !outside && date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
    const futureDay = isAfterToday(date);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) cell.classList.add("cell--weekend");
    if (isToday) cell.classList.add("cell--today");
    if ((!outside && futureDay) || (outside && futureDay)) cell.classList.add("cell--future");
    cell.setAttribute("aria-label", `${date.getMonth() + 1}월 ${date.getDate()}일`);

    const top = document.createElement("div");
    top.className = "cell-top";
    const dateEl = document.createElement("div");
    dateEl.className = "cell-date";
    dateEl.textContent = String(date.getDate());
    top.appendChild(dateEl);
    if (isToday && !isMobileCalendar()) {
      const badge = document.createElement("span");
      badge.className = "cell-today-badge";
      badge.textContent = "오늘";
      top.appendChild(badge);
    }
    cell.appendChild(top);

    const usersEl = document.createElement("div");
    usersEl.className = "cell-users cell-users--solo";
    renderCellStatus(usersEl, {
      key,
      outside,
      futureInMonth: !outside && futureDay,
      futurePadding: outside && futureDay,
      todayKey,
    });
    cell.appendChild(usersEl);

    if (!outside && !futureDay) {
      const dayStatus = getDayStatus(key);
      if (dayStatus === "ok" || dayStatus === "miss") cell.classList.add(`cell--${dayStatus}`);
    }
    frag.appendChild(cell);
  });

  grid.appendChild(frag);
}

function goMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  renderCalendar();
}

function goToday() {
  const t = new Date();
  viewYear = t.getFullYear();
  viewMonth = t.getMonth();
  renderCalendar();
}

function renderDispenseSlots() {
  updateDispenseSlotDisplay();
}

function setupDispenseSystem() {
  if (typeof window.DispenseSystem === "undefined") return;

  window.DispenseSystem.init({
    onComplete({ vitaminId, time, isTest }) {
      if (isTest) return;
      const key = toDateKey(new Date());
      setSlotTaken(key, vitaminId, time, true);
      const input = document.getElementById("dispense-slot");
      if (input) input.value = "";
      updateDispenseSlotDisplay();
      renderDailySummary();
      renderCalendar();
      renderDispenseSlots();
      const v = VITAMINS.find((x) => x.id === vitaminId);
      notifyUser(
        "복용 완료",
        `${v ? v.name : "영양제"}(${time}) AI가 복용을 확인했습니다.`,
        `dispense|${key}|${vitaminId}|${time}`,
        "intake"
      );
    },
  });

  renderDispenseSlots();
}

function renderManage() {
  const registry = document.getElementById("vitamin-registry");
  const countEl = document.getElementById("vitamin-count");
  if (!registry) return;

  if (countEl) countEl.textContent = VITAMINS.length ? `${VITAMINS.length}개` : "";

  if (VITAMINS.length === 0) {
    registry.innerHTML = `<div class="registry-empty">등록된 영양제가 없습니다.</div>`;
    return;
  }

  registry.innerHTML = VITAMINS.map(
    (v) => `<div class="reg-item reg-item--compact" data-id="${escapeHtml(v.id)}">
      <div class="reg-item__main">
        <strong class="reg-name">${escapeHtml(v.name)}</strong>
        <span class="reg-dose">${escapeHtml(v.dosage)} · ${escapeHtml(formatTimes(v.times))}</span>
      </div>
      <button type="button" class="reg-del reg-del--sm" data-del="${escapeHtml(v.id)}" aria-label="삭제">×</button>
    </div>`
  ).join("");

  registry.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!id) return;
      VITAMINS = VITAMINS.filter((x) => x.id !== id);
      saveVitamins();
      renderManage();
      renderDailySummary();
      renderCalendar();
      renderDispenseSlots();
      rescheduleNotifications();
    });
  });
}

function setupVitaminForm() {
  const form = document.getElementById("vitamin-form");
  const msg = document.getElementById("form-msg");
  if (!form || !msg) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("v-name")?.value?.trim() || "";
    const dosage = document.getElementById("v-dosage")?.value?.trim() || "";
    const ingredients = document.getElementById("v-ingredients")?.value?.trim() || "";
    const times = parseTimesInput(document.getElementById("v-times")?.value || "");

    if (!name || !dosage || !ingredients) {
      msg.textContent = "모든 항목을 입력해 주세요.";
      msg.className = "form-msg form-msg--err";
      return;
    }
    if (times.length === 0) {
      msg.textContent = "복용 시간을 HH:mm 형식으로 입력해 주세요.";
      msg.className = "form-msg form-msg--err";
      return;
    }

    VITAMINS.unshift({ id: uuid(), name, dosage, ingredients, times });
    saveVitamins();

    document.getElementById("v-name").value = "";
    document.getElementById("v-dosage").value = "";
    document.getElementById("v-ingredients").value = "";
    document.getElementById("v-times").value = "";

    msg.textContent = `'${name}'이(가) 등록되었습니다.`;
    msg.className = "form-msg form-msg--ok";

    renderManage();
    renderDailySummary();
    renderCalendar();
    renderDispenseSlots();
    rescheduleNotifications();
  });
}

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#0b1220" : "#f0fdfa");
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.setAttribute("aria-label", theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환");
}

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  applyTheme(getPreferredTheme());
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  });
}

/** @type {HTMLDivElement | null} */
let TOAST_ROOT = null;
let TOAST_HIDE_TIMER = null;
/** @type {{ title: string; body: string; tone: "ok"|"warn" }[]} */
let TOAST_QUEUE = [];

function ensureToastRoot() {
  if (TOAST_ROOT) return TOAST_ROOT;
  const root = document.createElement("div");
  root.id = "toast-root";
  root.className = "toast-root";
  root.setAttribute("aria-live", "polite");
  document.body.appendChild(root);
  TOAST_ROOT = root;
  return root;
}

function showToast(title, body, tone) {
  const root = ensureToastRoot();
  root.innerHTML = `<div class="toast toast--${tone}" role="status"><div class="toast__title">${escapeHtml(title)}</div><div class="toast__body">${escapeHtml(body)}</div></div>`;
  root.classList.add("toast-root--show");
  if (TOAST_HIDE_TIMER) clearTimeout(TOAST_HIDE_TIMER);
  TOAST_HIDE_TIMER = window.setTimeout(() => {
    root.classList.remove("toast-root--show");
    if (TOAST_QUEUE.length) {
      const next = TOAST_QUEUE.shift();
      if (next) showToast(next.title, next.body, next.tone);
    }
  }, 3800);
}

function enqueueToast(title, body, tone) {
  if (TOAST_ROOT?.classList.contains("toast-root--show")) {
    TOAST_QUEUE.push({ title, body, tone });
    if (TOAST_QUEUE.length > 5) TOAST_QUEUE = TOAST_QUEUE.slice(-5);
    return;
  }
  showToast(title, body, tone);
}

function showBrowserNotification(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag });
  } catch {
    // ignore
  }
}

function vibrateFor(kind) {
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(kind === "intake" ? [80, 60, 80] : [120, 80, 120, 80, 120]);
  } catch {
    // ignore
  }
}

function notifyUser(title, body, tag, kind) {
  if (Notification.permission === "granted") showBrowserNotification(title, body, tag);
  enqueueToast(title, body, kind === "intake" ? "ok" : "warn");
  vibrateFor(kind);
}

function clearNotificationTimers() {
  NOTIFY_TIMERS.forEach((id) => clearTimeout(id));
  NOTIFY_TIMERS = [];
}

function dateAtTime(dateKey, time) {
  const d = dateFromKey(dateKey);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function ensureNotifyDayRollover() {
  const today = toDateKey(new Date());
  if (today === NOTIFY_DAY_KEY) return;
  NOTIFY_DAY_KEY = today;
  loadNotifySent();
}

function fireIntakeNotify(dateKey, v, time) {
  ensureNotifyDayRollover();
  if (!NOTIFY_SETTINGS.enabled || !NOTIFY_SETTINGS.intakeReminder) return;
  if (dateKey !== toDateKey(new Date())) return;
  const key = `intake|${dateKey}|${v.id}|${time}`;
  if (wasNotifySent(key)) return;
  notifyUser("복용 시간입니다", `${v.name}(${time}) 복용 시간입니다.`, key, "intake");
  markNotifySent(key);
}

function fireMissedNotify(dateKey, v, time) {
  ensureNotifyDayRollover();
  if (!NOTIFY_SETTINGS.enabled || !NOTIFY_SETTINGS.missedReminder) return;
  if (dateKey !== toDateKey(new Date())) return;
  const key = `missed|${dateKey}|${v.id}|${time}`;
  if (wasNotifySent(key) || isSlotTaken(dateKey, v.id, time)) return;
  notifyUser("미복용 알림", `${v.name}(${time}) 복용 기록이 없습니다.`, key, "missed");
  markNotifySent(key);
  syncDayIntakeFromSlots(dateKey);
}

function rescheduleNotifications() {
  clearNotificationTimers();
  ensureNotifyDayRollover();
  if (!NOTIFY_SETTINGS.enabled || !("Notification" in window) || Notification.permission !== "granted") return;

  const dateKey = toDateKey(new Date());
  const now = Date.now();
  const GRACE_MS = 5 * 60 * 1000;

  VITAMINS.forEach((v) => {
    (v.times || ["09:00"]).forEach((time) => {
      const at = dateAtTime(dateKey, time).getTime();
      const missedAt = at + Math.max(5, Math.min(180, NOTIFY_SETTINGS.missedDelayMinutes)) * 60 * 1000;

      if (NOTIFY_SETTINGS.intakeReminder) {
        if (at >= now) NOTIFY_TIMERS.push(setTimeout(() => fireIntakeNotify(dateKey, v, time), at - now));
        else if (now - at <= GRACE_MS) NOTIFY_TIMERS.push(setTimeout(() => fireIntakeNotify(dateKey, v, time), 250));
      }
      if (NOTIFY_SETTINGS.missedReminder) {
        if (missedAt >= now) NOTIFY_TIMERS.push(setTimeout(() => fireMissedNotify(dateKey, v, time), missedAt - now));
        else if (now - missedAt <= GRACE_MS) NOTIFY_TIMERS.push(setTimeout(() => fireMissedNotify(dateKey, v, time), 350));
      }
    });
  });

  const next = new Date();
  next.setHours(24, 0, 5, 0);
  NOTIFY_TIMERS.push(setTimeout(rescheduleNotifications, Math.max(1000, next.getTime() - now)));
}

function checkNotificationsBackup() {
  ensureNotifyDayRollover();
  if (!NOTIFY_SETTINGS.enabled || Notification.permission !== "granted") return;
  const dateKey = toDateKey(new Date());
  const now = Date.now();
  const GRACE_MS = 10 * 60 * 1000;

  VITAMINS.forEach((v) => {
    (v.times || ["09:00"]).forEach((time) => {
      const at = dateAtTime(dateKey, time).getTime();
      const missedAt = at + NOTIFY_SETTINGS.missedDelayMinutes * 60 * 1000;
      if (NOTIFY_SETTINGS.intakeReminder && now >= at && now <= at + GRACE_MS) fireIntakeNotify(dateKey, v, time);
      if (NOTIFY_SETTINGS.missedReminder && now >= missedAt) fireMissedNotify(dateKey, v, time);
    });
  });
}

function startNotificationScheduler() {
  window.addEventListener("focus", rescheduleNotifications);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      rescheduleNotifications();
      checkNotificationsBackup();
    }
  });
  rescheduleNotifications();
  setInterval(checkNotificationsBackup, 60000);
  checkNotificationsBackup();
}

function setupNotifySettings() {
  const enabled = document.getElementById("notify-enabled");
  const intake = document.getElementById("notify-intake");
  const missed = document.getElementById("notify-missed");
  const delay = document.getElementById("notify-delay");
  const permBtn = document.getElementById("btn-notify-permission");
  const status = document.getElementById("notify-status");
  if (!enabled || !intake || !missed || !delay) return;

  enabled.checked = NOTIFY_SETTINGS.enabled;
  intake.checked = NOTIFY_SETTINGS.intakeReminder;
  missed.checked = NOTIFY_SETTINGS.missedReminder;
  delay.value = String(NOTIFY_SETTINGS.missedDelayMinutes);

  function updateStatus() {
    if (!status) return;
    if (!("Notification" in window)) {
      status.textContent = "이 브라우저는 알림을 지원하지 않습니다.";
      status.className = "form-msg form-msg--err";
      return;
    }
    if (location?.protocol === "file:") {
      status.textContent = "file:// 로는 알림이 불안정할 수 있습니다. 로컬 서버 사용을 권장합니다.";
      status.className = "form-msg";
      return;
    }
    const perm = Notification.permission;
    if (perm === "granted") {
      status.textContent = "알림 권한이 허용되었습니다.";
      status.className = "form-msg form-msg--ok";
    } else if (perm === "denied") {
      status.textContent = "알림이 차단되었습니다. 브라우저 설정에서 허용해 주세요.";
      status.className = "form-msg form-msg--err";
    } else {
      status.textContent = "알림 권한을 요청해 주세요.";
      status.className = "form-msg";
    }
  }

  function persist() {
    NOTIFY_SETTINGS = {
      enabled: enabled.checked,
      intakeReminder: intake.checked,
      missedReminder: missed.checked,
      missedDelayMinutes: Math.max(5, Math.min(180, Number(delay.value) || 30)),
    };
    saveNotifySettings();
    updateStatus();
    rescheduleNotifications();
  }

  enabled.addEventListener("change", persist);
  intake.addEventListener("change", persist);
  missed.addEventListener("change", persist);
  delay.addEventListener("change", persist);

  if (permBtn) {
    permBtn.addEventListener("click", async () => {
      if ("Notification" in window) {
        try {
          await Notification.requestPermission();
        } catch {
          // ignore
        }
      }
      updateStatus();
    });
  }

  updateStatus();
}

const VIEW_TAB_KEY = "appViewTab";
const TEST_SLOT_VALUE = "__test__|test";
/** @type {((name: string) => void) | null} */
let switchAppView = null;

function updateDispenseSlotDisplay() {
  const input = document.getElementById("dispense-slot");
  const display = document.getElementById("dispense-slot-display");
  if (!input || !display) return;

  const value = input.value;
  if (!value || value === TEST_SLOT_VALUE) {
    if (value === TEST_SLOT_VALUE) {
      display.innerHTML = `<div class="dispense-selected__card dispense-selected__card--test">
        <p class="dispense-selected__label">테스트 모드</p>
        <p class="dispense-selected__name">AI 확인용 (기록 없음)</p>
      </div>`;
    } else {
      display.innerHTML = `<p class="dispense-selected__empty">「오늘의 복용」에서 항목을 선택하세요.</p>`;
    }
    return;
  }

  const [vitaminId, time] = value.split("|");
  const v = VITAMINS.find((x) => x.id === vitaminId);
  display.innerHTML = `<div class="dispense-selected__card">
    <p class="dispense-selected__label">선택된 복용</p>
    <p class="dispense-selected__name">${escapeHtml(v ? v.name : "영양제")}</p>
    <p class="dispense-selected__meta">${escapeHtml(time || "")} · ${escapeHtml(v ? v.dosage : "")}</p>
  </div>`;
}

function setDispenseSlot(vitaminId, time) {
  const input = document.getElementById("dispense-slot");
  if (!input) return;
  input.value = `${vitaminId}|${time}`;
  updateDispenseSlotDisplay();
  renderDailySummary();
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function openDispenseForSlot(vitaminId, time) {
  const key = toDateKey(new Date());
  if (isSlotTaken(key, vitaminId, time)) return;
  setDispenseSlot(vitaminId, time);
  if (switchAppView) switchAppView("ai");
}

function setupDailyListActions() {
  const listEl = document.getElementById("daily-list");
  if (!listEl) return;

  listEl.addEventListener("click", (e) => {
    const row = e.target.closest("[data-dispense-slot]");
    if (!row || row.dataset.taken === "true") return;
    const vitaminId = row.getAttribute("data-vitamin-id");
    const time = row.getAttribute("data-time");
    if (!vitaminId || !time) return;
    openDispenseForSlot(vitaminId, time);
  });
}

function setupViewTabs() {
  const tabs = document.querySelectorAll(".view-tab");
  const views = {
    home: document.getElementById("view-home"),
    ai: document.getElementById("view-ai"),
    manage: document.getElementById("view-manage"),
  };
  const sub = document.getElementById("dash-header-sub");
  const SUBS = {
    home: "오늘 복용 · 월간 캘린더",
    ai: "AI 복용 인증 완료 시에만 기록됩니다 · 배출 → 카메라 → 꿀꺽 감지",
    manage: "영양제 등록 · 복용 시간 설정 · 목록 관리",
  };

  function setView(name) {
    const view = name === "ai" || name === "manage" ? name : "home";
    Object.entries(views).forEach(([key, el]) => {
      if (!el) return;
      const active = key === view;
      el.hidden = !active;
      el.classList.toggle("dash-view--active", active);
    });
    tabs.forEach((btn) => {
      const active = btn.getAttribute("data-view") === view;
      btn.classList.toggle("view-tab--active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (sub) sub.textContent = SUBS[view];
    try {
      localStorage.setItem(VIEW_TAB_KEY, view);
    } catch {
      // ignore
    }
    if (view === "home") renderCalendar();
  }

  switchAppView = setView;

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
  });

  let saved = "home";
  try {
    saved = localStorage.getItem(VIEW_TAB_KEY) || "home";
  } catch {
    // ignore
  }
  setView(saved === "ai" || saved === "manage" ? saved : "home");
}

purgeFutureIntakeLogs();
setupThemeToggle();
setupViewTabs();
setupDailyListActions();
loadVitamins();
loadSlotLog();
loadNotifySettings();
loadNotifySent();
renderWeekdays();
renderCalendar();
renderDailySummary();
setupDispenseSystem();
renderManage();
setupVitaminForm();
setupNotifySettings();
startNotificationScheduler();

document.getElementById("btn-prev")?.addEventListener("click", () => goMonth(-1));
document.getElementById("btn-next")?.addEventListener("click", () => goMonth(1));
document.getElementById("btn-today")?.addEventListener("click", goToday);

let calendarResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(calendarResizeTimer);
  calendarResizeTimer = setTimeout(renderCalendar, 160);
});
