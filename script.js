/**
 * 가족 구성원
 * @typedef {{ id: string; name: string; color: string }} Member
 */

/** @type {Member[]} */
const MEMBERS = [
  {
    id: "m1",
    name: "엄마",
    color: "#0d9488",
  },
  {
    id: "m2",
    name: "아빠",
    color: "#2563eb",
  },
  {
    id: "m3",
    name: "민수",
    color: "#c2410c",
  },
];

/**
 * 비타민 등록 데이터
 * @typedef {{ id: string; name: string; ingredients: string; memberId: string; dosage: string; times: string[] }} Vitamin
 */

/**
 * @typedef {{ enabled: boolean; intakeReminder: boolean; missedReminder: boolean; missedDelayMinutes: number }} NotifySettings
 */

/**
 * 날짜별 구성원 복용 요약 (캘린더용, 슬롯 기록에서 자동 계산)
 * @type {Record<string, Record<string, boolean>>}
 */
const INTAKE_LOG = {};

/**
 * 날짜·비타민·시간대별 복용 기록
 * 키: "YYYY-MM-DD|vitaminId|HH:mm"
 * @type {Record<string, boolean>}
 */
const SLOT_LOG = {};

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

/** @type {Vitamin[]} */
let VITAMINS = [];

/** @type {NotifySettings} */
let NOTIFY_SETTINGS = {
  enabled: true,
  intakeReminder: true,
  missedReminder: true,
  missedDelayMinutes: 30,
};

/** @type {Record<string, string[]>} 오늘 이미 보낸 알림 키 */
let NOTIFY_SENT_TODAY = {};

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

/** 오늘 0시 (로컬) */
function startOfToday() {
  return startOfDay(new Date());
}

/**
 * 해당 날짜가 오늘보다 이후인지 (로컬 달력 기준)
 * @param {Date} d
 */
function isAfterToday(d) {
  return startOfDay(d) > startOfToday();
}

/** 저장소에서 오늘 이후 날짜 기록 제거 */
function purgeFutureIntakeLogs() {
  const t = startOfToday();
  for (const key of Object.keys(INTAKE_LOG)) {
    if (dateFromKey(key) > t) {
      delete INTAKE_LOG[key];
    }
  }
}

function memberInitial(name) {
  return name.trim().slice(0, 1) || "?";
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

/** @param {string} time HH:mm */
function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** @returns {Vitamin[]} */
function defaultVitamins() {
  return [
    {
      id: uuid(),
      memberId: "m1",
      name: "종합비타민",
      dosage: "1정",
      ingredients: "비타민 A, B군, C, D, E, 미네랄",
      times: ["08:00"],
    },
    {
      id: uuid(),
      memberId: "m1",
      name: "유산균",
      dosage: "1캡슐",
      ingredients: "프로바이오틱스, 프리바이오틱스",
      times: ["21:00"],
    },
    {
      id: uuid(),
      memberId: "m2",
      name: "오메가3",
      dosage: "1캡슐",
      ingredients: "EPA/DHA, 비타민E",
      times: ["08:30"],
    },
    {
      id: uuid(),
      memberId: "m2",
      name: "밀크시슬",
      dosage: "1정",
      ingredients: "실리마린",
      times: ["21:30"],
    },
    {
      id: uuid(),
      memberId: "m3",
      name: "어린이 종합비타민",
      dosage: "1정",
      ingredients: "비타민/미네랄 (어린이용 배합)",
      times: ["09:00"],
    },
    {
      id: uuid(),
      memberId: "m3",
      name: "칼슘",
      dosage: "1정",
      ingredients: "칼슘, 비타민D",
      times: ["20:00"],
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
            memberId: String(x.memberId || ""),
            dosage: String(x.dosage || ""),
            times: times.length ? times.map((t) => {
              const [h, m] = String(t).split(":").map(Number);
              return `${pad2(h)}:${pad2(m)}`;
            }) : ["09:00"],
          };
        })
        .filter((x) => x.name && x.ingredients && x.memberId && x.dosage);
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
}

/**
 * @param {string} dateKey
 * @param {string} memberId
 * @returns {{ vitamin: Vitamin; time: string }[]}
 */
function getMemberSlots(dateKey, memberId) {
  const slots = [];
  vitaminsForMember(memberId).forEach((v) => {
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
  const dueMin = timeToMinutes(time) + NOTIFY_SETTINGS.missedDelayMinutes;
  return nowMin >= dueMin;
}

/** @param {string} dateKey @param {string} memberId */
function syncMemberIntakeFromSlots(dateKey, memberId) {
  const slots = getMemberSlots(dateKey, memberId);
  if (!INTAKE_LOG[dateKey]) INTAKE_LOG[dateKey] = {};
  if (slots.length === 0) {
    delete INTAKE_LOG[dateKey][memberId];
    return;
  }
  const allTaken = slots.every((s) => isSlotTaken(dateKey, s.vitamin.id, s.time));
  const anyMissed = slots.some((s) => isSlotOverdue(dateKey, s.vitamin.id, s.time));
  if (allTaken) INTAKE_LOG[dateKey][memberId] = true;
  else if (anyMissed) INTAKE_LOG[dateKey][memberId] = false;
  else delete INTAKE_LOG[dateKey][memberId];
}

/** @param {string} dateKey @param {string} memberId */
function getMemberStatusFromSlots(dateKey, memberId) {
  syncMemberIntakeFromSlots(dateKey, memberId);
  return getStatusForMember(dateKey, memberId);
}

/** @param {string} memberId */
function vitaminsForMember(memberId) {
  return VITAMINS.filter((v) => v.memberId === memberId);
}

/** @param {string} memberId */
function memberName(memberId) {
  const m = MEMBERS.find((x) => x.id === memberId);
  return m ? m.name : "알 수 없음";
}

/**
 * @param {"ok"|"miss"|"none"} status
 */
function statusIconSvg(status) {
  if (status === "ok") {
    return `<svg class="state-ico state-ico--ok" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (status === "miss") {
    return `<svg class="state-ico state-ico--miss" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  }
  return `<svg class="state-ico state-ico--none" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3.5 3"/></svg>`;
}

/**
 * 과거·오늘만 샘플 데이터 생성. 미래 날짜는 기록을 비움.
 * @param {number} year
 * @param {number} monthIndex
 */
function ensureMonthSample(year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const today = startOfToday();

  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(year, monthIndex, day);
    const key = toDateKey(d);

    if (startOfDay(d) > today) {
      if (INTAKE_LOG[key]) delete INTAKE_LOG[key];
      continue;
    }

    if (INTAKE_LOG[key]) continue;
    INTAKE_LOG[key] = {};
    MEMBERS.forEach((m, i) => {
      const roll = (day + i * 3) % 10;
      if (roll < 1) return;
      if (roll < 6) INTAKE_LOG[key][m.id] = true;
      else INTAKE_LOG[key][m.id] = false;
    });
  }
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** @param {string} dateKey */
function getStatusForMember(dateKey, memberId) {
  const dayLog = INTAKE_LOG[dateKey];
  if (!dayLog || !(memberId in dayLog)) return "none";
  return dayLog[memberId] ? "ok" : "miss";
}

function renderLegend() {
  const ul = document.getElementById("legend-list");
  if (!ul) return;
  ul.innerHTML = MEMBERS.map((m) => {
    const ini = escapeHtml(memberInitial(m.name));
    const nm = escapeHtml(m.name);
    return `<li class="legend-chip" style="--member:${m.color}">
      <span class="legend-chip__avatar">${ini}</span>
      <span class="legend-chip__name">${nm}</span>
    </li>`;
  }).join("");
}

function renderVitaminPanel() {
  const container = document.getElementById("vitamin-list");
  if (!container) return;

  container.innerHTML = MEMBERS.map((m) => {
    const ini = escapeHtml(memberInitial(m.name));
    const nm = escapeHtml(m.name);
    const list = vitaminsForMember(m.id);
    const tags =
      list.length > 0
        ? list
            .map(
              (v) =>
                `<li><span class="vitamin-tag" title="${escapeHtml(v.ingredients)}">${escapeHtml(v.name)} · ${escapeHtml(v.dosage)} · ${escapeHtml(formatTimes(v.times))}</span></li>`
            )
            .join("")
        : `<li><span class="vitamin-tag vitamin-tag--empty">등록된 비타민 없음</span></li>`;
    return `<article class="vitamin-card" style="--member:${m.color}">
      <div class="vitamin-card__head">
        <span class="vitamin-card__avatar" aria-hidden="true">${ini}</span>
        <h3 class="vitamin-card__name">${nm}</h3>
      </div>
      <ul class="vitamin-card__tags" aria-label="${nm} 복용 비타민">${tags}</ul>
    </article>`;
  }).join("");
}

/** @param {Member} m */
function vitaminsSummary(m) {
  const list = vitaminsForMember(m.id);
  if (list.length === 0) return "";
  return list.map((v) => `${v.name}(${v.dosage})`).join(", ");
}

/** 오늘 날짜 문구 + 구성원별 복용 줄 */
function renderDailySummary() {
  const dateEl = document.getElementById("daily-date");
  const listEl = document.getElementById("daily-list");
  if (!dateEl || !listEl) return;

  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const day = now.getDate();
  const wd = WEEKDAY_NAMES[now.getDay()];
  dateEl.textContent = `${y}년 ${mo + 1}월 ${day}일 (${wd})`;

  const key = toDateKey(now);

  listEl.innerHTML = MEMBERS.map((m) => {
    const status = getMemberStatusFromSlots(key, m.id);
    const slots = getMemberSlots(key, m.id);

    const slotsHtml =
      slots.length > 0
        ? slots
            .map(({ vitamin: v, time }) => {
              const taken = isSlotTaken(key, v.id, time);
              const overdue = isSlotOverdue(key, v.id, time);
              const rowClass = taken ? "slot-row--ok" : overdue ? "slot-row--miss" : "slot-row--pending";
              return `<div class="slot-row ${rowClass}" data-vid="${escapeHtml(v.id)}" data-time="${escapeHtml(time)}">
                <div class="slot-row__info">
                  <span class="slot-row__time">${escapeHtml(time)}</span>
                  <span class="slot-row__name">${escapeHtml(v.name)}</span>
                  <span class="slot-row__dose">${escapeHtml(v.dosage)}</span>
                </div>
                <button type="button" class="slot-check ${taken ? "slot-check--done" : ""}" data-slot-check="${escapeHtml(v.id)}" data-slot-time="${escapeHtml(time)}">
                  ${taken ? "완료" : "복용"}
                </button>
              </div>`;
            })
            .join("")
        : `<p class="daily-empty">등록된 비타민이 없습니다. 비타민 등록 탭에서 추가하세요.</p>`;

    return `<article class="daily-member daily-member--${status}">
      <header class="daily-member__head">
        <span class="daily-row__avatar" style="--member:${m.color}">${escapeHtml(memberInitial(m.name))}</span>
        <span class="daily-member__name">${escapeHtml(m.name)}</span>
        <span class="daily-member__status">${escapeHtml(labelStatus(status))}</span>
        <span class="daily-member__ico">${statusIconSvg(status)}</span>
      </header>
      <div class="daily-member__slots">${slotsHtml}</div>
    </article>`;
  }).join("");

  listEl.querySelectorAll("[data-slot-check]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vid = btn.getAttribute("data-slot-check");
      const time = btn.getAttribute("data-slot-time");
      if (!vid || !time) return;
      const taken = !isSlotTaken(key, vid, time);
      setSlotTaken(key, vid, time, taken);
      MEMBERS.forEach((m) => syncMemberIntakeFromSlots(key, m.id));
      renderDailySummary();
      renderCalendar();
    });
  });
}

function renderWeekdays() {
  const el = document.getElementById("weekdays");
  if (!el) return;
  el.innerHTML = WEEKDAY_LABELS.map((label, i) => {
    const weekend = i === 0 || i === 6 ? " weekday weekday--end" : " weekday";
    return `<div class="${weekend.trim()}">
      <span class="weekday__dot" aria-hidden="true"></span>
      <span class="weekday__label">${label}</span>
    </div>`;
  }).join("");
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** @param {"light"|"dark"} theme */
function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#0b1220" : "#f0fdfa");

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const next = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
    btn.setAttribute("aria-label", next);
  }
}

function setupThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  const initial = getPreferredTheme();
  applyTheme(initial);

  btn.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  });
}

function isMobileCalendar() {
  return window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
}

/**
 * @param {HTMLElement} usersEl
 * @param {{ key: string, outside: boolean, futureInMonth: boolean, futurePadding: boolean, todayKey: string }} ctx
 */
function renderCellMembers(usersEl, ctx) {
  const { key, outside, futureInMonth, futurePadding, todayKey } = ctx;
  const compact = isMobileCalendar();

  if (futureInMonth || futurePadding) {
    if (!compact) {
      const note = document.createElement("div");
      note.className = "cell-future-note";
      note.textContent = "기록 없음";
      usersEl.appendChild(note);
    }
    return;
  }

  if (compact) {
    const dots = document.createElement("div");
    dots.className = "cell-dots";
    dots.setAttribute("role", "group");
    dots.setAttribute("aria-label", "구성원 복용 상태");

    MEMBERS.forEach((m) => {
      const status = outside
        ? "none"
        : key === todayKey
          ? getMemberStatusFromSlots(key, m.id)
          : getStatusForMember(key, m.id);
      const dot = document.createElement("span");
      dot.className = `status-dot status-dot--${status}`;
      dot.style.setProperty("--member", m.color);
      const vLine = vitaminsSummary(m);
      dot.title = vLine
        ? `${m.name} (${vLine}) — ${labelStatus(status)}`
        : `${m.name}: ${labelStatus(status)}`;
      dot.setAttribute("aria-label", dot.title);
      dot.textContent = memberInitial(m.name);
      dots.appendChild(dot);
    });

    usersEl.appendChild(dots);
    return;
  }

  MEMBERS.forEach((m) => {
    const status = outside
      ? "none"
      : key === todayKey
        ? getMemberStatusFromSlots(key, m.id)
        : getStatusForMember(key, m.id);
    const row = document.createElement("div");
    row.className = "member-pill member-pill--" + status;
    const vLine = vitaminsSummary(m);
    row.title = vLine
      ? `${m.name} (${vLine}) — ${labelStatus(status)}`
      : `${m.name}: ${labelStatus(status)}`;

    row.innerHTML = `
        <span class="member-pill__avatar" style="--member:${m.color}">${escapeHtml(memberInitial(m.name))}</span>
        <span class="member-pill__name">${escapeHtml(m.name)}</span>
        <span class="member-pill__state">${statusIconSvg(status)}</span>
      `;

    usersEl.appendChild(row);
  });
}

function renderCalendar() {
  ensureMonthSample(viewYear, viewMonth);

  const todayKey = toDateKey(new Date());
  MEMBERS.forEach((m) => syncMemberIntakeFromSlots(todayKey, m.id));

  const label = document.getElementById("month-label");
  if (label) label.textContent = `${viewYear}년 ${viewMonth + 1}월`;

  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  grid.classList.toggle("grid--compact", isMobileCalendar());
  grid.innerHTML = "";

  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const today = new Date();
  const isThisMonth =
    today.getFullYear() === viewYear && today.getMonth() === viewMonth;

  const prevMonthLast = daysInMonth(viewYear, viewMonth - 1);
  const cells = [];

  for (let i = 0; i < startWeekday; i++) {
    const d = prevMonthLast - startWeekday + i + 1;
    cells.push({ date: new Date(viewYear, viewMonth - 1, d), outside: true });
  }

  for (let day = 1; day <= totalDays; day++) {
    cells.push({ date: new Date(viewYear, viewMonth, day), outside: false });
  }

  const remainder = cells.length % 7;
  const padEnd = remainder === 0 ? 0 : 7 - remainder;
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
      isThisMonth &&
      !outside &&
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    const futureDay = isAfterToday(date);
    const futureInMonth = !outside && futureDay;
    const futurePadding = outside && futureDay;

    if (isToday) cell.classList.add("cell--today");
    if (futureInMonth || futurePadding) cell.classList.add("cell--future");

    const top = document.createElement("div");
    top.className = "cell-top";

    const dateEl = document.createElement("div");
    dateEl.className = "cell-date";
    dateEl.textContent = String(date.getDate());

    if (isToday && !isMobileCalendar()) {
      const badge = document.createElement("span");
      badge.className = "cell-today-badge";
      badge.textContent = "오늘";
      top.appendChild(dateEl);
      top.appendChild(badge);
    } else {
      top.appendChild(dateEl);
    }

    cell.appendChild(top);

    const usersEl = document.createElement("div");
    usersEl.className = "cell-users";
    renderCellMembers(usersEl, { key, outside, futureInMonth, futurePadding, todayKey });

    cell.appendChild(usersEl);
    frag.appendChild(cell);
  });

  grid.appendChild(frag);
}

/** @param {"ok"|"miss"|"none"} s */
function labelStatus(s) {
  if (s === "ok") return "복용";
  if (s === "miss") return "미복용";
  return "기록 없음";
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
  const select = document.getElementById("dispense-slot");
  if (!select) return;

  const key = toDateKey(new Date());
  const options = [];

  MEMBERS.forEach((m) => {
    getMemberSlots(key, m.id).forEach(({ vitamin: v, time }) => {
      const taken = isSlotTaken(key, v.id, time);
      const suffix = taken ? " (완료)" : "";
      options.push({
        value: `${v.id}|${time}`,
        label: `${m.name} · ${v.name} · ${time}${suffix}`,
        disabled: taken,
      });
    });
  });

  if (options.length === 0) {
    select.innerHTML = `<option value="">오늘 복용 항목이 없습니다</option>`;
    return;
  }

  select.innerHTML =
    `<option value="">복용할 항목을 선택하세요</option>` +
    options
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}"${o.disabled ? " disabled" : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");
}

function setupDispenseSystem() {
  if (typeof window.DispenseSystem === "undefined") return;

  window.DispenseSystem.init({
    onComplete({ vitaminId, time }) {
      const key = toDateKey(new Date());
      setSlotTaken(key, vitaminId, time, true);
      MEMBERS.forEach((m) => syncMemberIntakeFromSlots(key, m.id));
      renderDailySummary();
      renderCalendar();
      renderDispenseSlots();

      const v = VITAMINS.find((x) => x.id === vitaminId);
      const name = v ? v.name : "비타민";
      notifyUser("복용 완료", `${name}(${time}) AI가 복용을 확인했습니다.`, `dispense|${key}|${vitaminId}|${time}`, "intake");
    },
  });

  renderDispenseSlots();
}

function setupViewTabs() {
  const views = document.getElementById("views");
  const tabCal = document.getElementById("tab-calendar");
  const tabCheck = document.getElementById("tab-check");
  const tabDispense = document.getElementById("tab-dispense");
  const tabManage = document.getElementById("tab-manage");
  const panelCal = document.getElementById("panel-calendar");
  const panelCheck = document.getElementById("panel-check");
  const panelDispense = document.getElementById("panel-dispense");
  const panelManage = document.getElementById("panel-manage");
  if (!views || !tabCal || !tabCheck || !tabManage) return;

  const tabs = [
    { key: "calendar", tab: tabCal, panel: panelCal },
    { key: "check", tab: tabCheck, panel: panelCheck },
    ...(tabDispense && panelDispense ? [{ key: "dispense", tab: tabDispense, panel: panelDispense }] : []),
    { key: "manage", tab: tabManage, panel: panelManage },
  ];

  function activate(which) {
    views.classList.remove("tab-calendar", "tab-check", "tab-dispense", "tab-manage");
    views.classList.add(`tab-${which}`);
    tabs.forEach(({ key, tab, panel }) => {
      const on = key === which;
      tab.classList.toggle("view-tab--active", on);
      tab.setAttribute("aria-selected", String(on));
      if (panel) {
        if (on) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
      }
    });
    if (which === "dispense") renderDispenseSlots();
  }

  tabCal.addEventListener("click", () => activate("calendar"));
  tabCheck.addEventListener("click", () => activate("check"));
  if (tabDispense) tabDispense.addEventListener("click", () => activate("dispense"));
  tabManage.addEventListener("click", () => activate("manage"));
  activate("calendar");
}

function renderManage() {
  const select = document.getElementById("v-member");
  const registry = document.getElementById("vitamin-registry");
  if (!select || !registry) return;

  select.innerHTML = MEMBERS.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("");

  if (VITAMINS.length === 0) {
    registry.innerHTML = `<div class="registry-empty">등록된 비타민이 없습니다.</div>`;
    return;
  }

  const byMember = MEMBERS.map((m) => {
    const list = vitaminsForMember(m.id);
    if (list.length === 0) return "";
    const items = list
      .map(
        (v) => `<div class="reg-item" data-id="${escapeHtml(v.id)}">
          <div class="reg-item__main">
            <div class="reg-item__top">
              <span class="reg-pill" style="--member:${m.color}">${escapeHtml(m.name)}</span>
              <strong class="reg-name">${escapeHtml(v.name)}</strong>
              <span class="reg-dose">${escapeHtml(v.dosage)}</span>
            </div>
            <p class="reg-ing">${escapeHtml(v.ingredients)}</p>
            <label class="reg-times-edit">
              <span class="reg-times-edit__label">복용 시간</span>
              <input class="field__control reg-times-input" type="text" value="${escapeHtml(formatTimes(v.times))}" data-times-edit="${escapeHtml(v.id)}" />
            </label>
            <button type="button" class="reg-save-times" data-save-times="${escapeHtml(v.id)}">시간 저장</button>
          </div>
          <button type="button" class="reg-del" data-del="${escapeHtml(v.id)}" aria-label="삭제">삭제</button>
        </div>`
      )
      .join("");
    return `<section class="registry-group">
      <h3 class="registry-group__title">${escapeHtml(m.name)}</h3>
      <div class="registry-group__items">${items}</div>
    </section>`;
  }).join("");

  registry.innerHTML = byMember;

  registry.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!id) return;
      VITAMINS = VITAMINS.filter((x) => x.id !== id);
      saveVitamins();
      renderManage();
      renderVitaminPanel();
      renderDailySummary();
      renderCalendar();
      rescheduleNotifications();
    });
  });

  registry.querySelectorAll("[data-save-times]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-save-times");
      if (!id) return;
      const input = registry.querySelector(`[data-times-edit="${id}"]`);
      const times = parseTimesInput(input?.value || "");
      if (times.length === 0) {
        alert("복용 시간을 HH:mm 형식으로 입력해 주세요. (예: 08:00, 21:00)");
        return;
      }
      const v = VITAMINS.find((x) => x.id === id);
      if (v) {
        v.times = times;
        saveVitamins();
        renderManage();
        renderVitaminPanel();
        renderDailySummary();
        rescheduleNotifications();
      }
    });
  });
}

function setupVitaminForm() {
  const form = document.getElementById("vitamin-form");
  const msg = document.getElementById("form-msg");
  if (!form || !msg) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = /** @type {HTMLInputElement} */ (document.getElementById("v-name"))?.value?.trim() || "";
    const dosage = /** @type {HTMLInputElement} */ (document.getElementById("v-dosage"))?.value?.trim() || "";
    const ingredients = /** @type {HTMLTextAreaElement} */ (document.getElementById("v-ingredients"))?.value?.trim() || "";
    const memberId = /** @type {HTMLSelectElement} */ (document.getElementById("v-member"))?.value || "";
    const times = parseTimesInput(/** @type {HTMLInputElement} */ (document.getElementById("v-times"))?.value || "");

    if (!name || !dosage || !ingredients || !memberId) {
      msg.textContent = "모든 항목을 입력해 주세요.";
      msg.className = "form-msg form-msg--err";
      return;
    }

    if (times.length === 0) {
      msg.textContent = "복용 시간을 HH:mm 형식으로 입력해 주세요. (예: 08:00, 21:00)";
      msg.className = "form-msg form-msg--err";
      return;
    }

    VITAMINS.unshift({ id: uuid(), name, dosage, ingredients, memberId, times });
    saveVitamins();

    /** @type {HTMLInputElement} */ (document.getElementById("v-name")).value = "";
    /** @type {HTMLInputElement} */ (document.getElementById("v-dosage")).value = "";
    /** @type {HTMLTextAreaElement} */ (document.getElementById("v-ingredients")).value = "";
    /** @type {HTMLInputElement} */ (document.getElementById("v-times")).value = "";

    msg.textContent = `${memberName(memberId)}에게 '${name}'이(가) 등록되었습니다.`;
    msg.className = "form-msg form-msg--ok";

    renderManage();
    renderVitaminPanel();
    renderDailySummary();
    renderCalendar();
    rescheduleNotifications();
  });
}

function showBrowserNotification(title, body, tag) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag });
  } catch {
    // ignore
  }
}

/** @type {HTMLDivElement | null} */
let TOAST_ROOT = null;
/** @type {number | null} */
let TOAST_HIDE_TIMER = null;
/** @type {{ title: string; body: string; tone: "ok" | "warn" }[]} */
let TOAST_QUEUE = [];

function ensureToastRoot() {
  if (TOAST_ROOT) return TOAST_ROOT;
  const root = document.createElement("div");
  root.id = "toast-root";
  root.className = "toast-root";
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-atomic", "true");
  document.body.appendChild(root);
  TOAST_ROOT = root;
  return root;
}

/**
 * @param {string} title
 * @param {string} body
 * @param {"ok"|"warn"} tone
 */
function showToast(title, body, tone) {
  const root = ensureToastRoot();
  root.innerHTML = `
    <div class="toast toast--${tone}" role="status">
      <div class="toast__title">${escapeHtml(title)}</div>
      <div class="toast__body">${escapeHtml(body)}</div>
    </div>
  `;
  root.classList.add("toast-root--show");

  if (TOAST_HIDE_TIMER) window.clearTimeout(TOAST_HIDE_TIMER);
  TOAST_HIDE_TIMER = window.setTimeout(() => {
    root.classList.remove("toast-root--show");
    // 다음 토스트가 있으면 이어서 표시
    if (TOAST_QUEUE.length > 0) {
      const next = TOAST_QUEUE.shift();
      if (next) showToast(next.title, next.body, next.tone);
    }
  }, 3800);
}

/**
 * @param {string} title
 * @param {string} body
 * @param {"ok"|"warn"} tone
 */
function enqueueToast(title, body, tone) {
  // 이미 보여주는 중이면 큐잉
  if (TOAST_ROOT && TOAST_ROOT.classList.contains("toast-root--show")) {
    TOAST_QUEUE.push({ title, body, tone });
    // 큐는 너무 길어지지 않게 제한
    if (TOAST_QUEUE.length > 5) TOAST_QUEUE = TOAST_QUEUE.slice(-5);
    return;
  }
  showToast(title, body, tone);
}

/** @param {"intake"|"missed"} kind */
function vibrateFor(kind) {
  if (!("vibrate" in navigator)) return;
  try {
    // 모바일에서 확실히 느껴지도록 짧은 패턴
    const pattern = kind === "intake" ? [80, 60, 80] : [120, 80, 120, 80, 120];
    navigator.vibrate(pattern);
  } catch {
    // ignore
  }
}

/**
 * 시스템 알림 + 토스트 + 진동을 함께 수행 (가능한 만큼)
 * @param {string} title
 * @param {string} body
 * @param {string} tag
 * @param {"intake"|"missed"} kind
 */
function notifyUser(title, body, tag, kind) {
  // 시스템 알림(가능한 경우)
  if (canUseBrowserNotification()) showBrowserNotification(title, body, tag);
  // 앱 내부 토스트(항상)
  enqueueToast(title, body, kind === "intake" ? "ok" : "warn");
  // 진동(가능한 경우)
  vibrateFor(kind);
}

/** @type {number[]} */
let NOTIFY_TIMERS = [];
let NOTIFY_DAY_KEY = toDateKey(new Date());

function clearNotificationTimers() {
  NOTIFY_TIMERS.forEach((id) => clearTimeout(id));
  NOTIFY_TIMERS = [];
}

function canUseBrowserNotification() {
  if (!("Notification" in window)) return false;
  return Notification.permission === "granted";
}

/** @param {string} dateKey @param {string} time HH:mm */
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
  // 날짜가 바뀌면 오늘 보낸 기록을 새로 로드(오늘 키만 유지)
  loadNotifySent();
}

function fireIntakeNotify(dateKey, v, time) {
  ensureNotifyDayRollover();
  if (!NOTIFY_SETTINGS.enabled || !NOTIFY_SETTINGS.intakeReminder) return;
  if (dateKey !== toDateKey(new Date())) return;

  const intakeKey = `intake|${dateKey}|${v.id}|${time}`;
  if (wasNotifySent(intakeKey)) return;

  notifyUser(
    "복용 시간입니다",
    `${memberName(v.memberId)}님, ${v.name}(${time}) 복용 시간입니다.`,
    intakeKey,
    "intake"
  );
  markNotifySent(intakeKey);
}

function fireMissedNotify(dateKey, v, time) {
  ensureNotifyDayRollover();
  if (!NOTIFY_SETTINGS.enabled || !NOTIFY_SETTINGS.missedReminder) return;
  if (dateKey !== toDateKey(new Date())) return;

  const missedKey = `missed|${dateKey}|${v.id}|${time}`;
  if (wasNotifySent(missedKey)) return;
  if (isSlotTaken(dateKey, v.id, time)) return;

  notifyUser(
    "미복용 알림",
    `${memberName(v.memberId)}님, ${v.name}(${time}) 복용 기록이 없습니다.`,
    missedKey,
    "missed"
  );
  markNotifySent(missedKey);
  syncMemberIntakeFromSlots(dateKey, v.memberId);
}

function rescheduleNotifications() {
  clearNotificationTimers();
  ensureNotifyDayRollover();

  if (!NOTIFY_SETTINGS.enabled) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const dateKey = toDateKey(new Date());
  const now = Date.now();

  // 이미 지나간 시각을 놓쳐도, "최근 N분"은 즉시 한 번 검사해서 보완
  const GRACE_MS = 5 * 60 * 1000;

  VITAMINS.forEach((v) => {
    (v.times || ["09:00"]).forEach((time) => {
      const at = dateAtTime(dateKey, time).getTime();
      const missedAt =
        at + Math.max(5, Math.min(180, NOTIFY_SETTINGS.missedDelayMinutes)) * 60 * 1000;

      // 복용 알림
      if (NOTIFY_SETTINGS.intakeReminder) {
        if (at >= now) {
          NOTIFY_TIMERS.push(setTimeout(() => fireIntakeNotify(dateKey, v, time), at - now));
        } else if (now - at <= GRACE_MS) {
          // 방금 지나간 경우 즉시 보완
          NOTIFY_TIMERS.push(setTimeout(() => fireIntakeNotify(dateKey, v, time), 250));
        }
      }

      // 미복용 알림
      if (NOTIFY_SETTINGS.missedReminder) {
        if (missedAt >= now) {
          NOTIFY_TIMERS.push(
            setTimeout(() => fireMissedNotify(dateKey, v, time), missedAt - now)
          );
        } else if (now - missedAt <= GRACE_MS) {
          NOTIFY_TIMERS.push(setTimeout(() => fireMissedNotify(dateKey, v, time), 350));
        }
      }
    });
  });

  // 날짜 변경(자정) 이후 자동 재스케줄
  const next = new Date();
  next.setHours(24, 0, 5, 0);
  const untilNext = next.getTime() - now;
  NOTIFY_TIMERS.push(setTimeout(rescheduleNotifications, Math.max(1000, untilNext)));
}

function checkNotificationsBackup() {
  ensureNotifyDayRollover();
  if (!NOTIFY_SETTINGS.enabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const dateKey = toDateKey(new Date());
  const now = Date.now();
  const GRACE_MS = 10 * 60 * 1000; // 타이머 지연 대비: 10분 이내면 복용 알림 허용

  VITAMINS.forEach((v) => {
    (v.times || ["09:00"]).forEach((time) => {
      const at = dateAtTime(dateKey, time).getTime();
      const missedAt = at + NOTIFY_SETTINGS.missedDelayMinutes * 60 * 1000;

      if (NOTIFY_SETTINGS.intakeReminder) {
        if (now >= at && now <= at + GRACE_MS) fireIntakeNotify(dateKey, v, time);
      }

      if (NOTIFY_SETTINGS.missedReminder) {
        if (now >= missedAt) fireMissedNotify(dateKey, v, time);
      }
    });
  });
}

function startNotificationScheduler() {
  // 포커스/복귀 시 놓친 알림을 빠르게 보완
  window.addEventListener("focus", () => rescheduleNotifications());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      rescheduleNotifications();
      checkNotificationsBackup();
    }
  });
  rescheduleNotifications();

  // 모바일 백그라운드/절전에서 타이머가 지연되는 경우가 있어 백업 체크를 병행
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
    if (location && location.protocol === "file:") {
      status.textContent =
        "참고: 파일로 직접 열면(file://) 모바일에서 알림이 막히거나 불안정할 수 있습니다. (Live Server 권장)";
      status.className = "form-msg";
      return;
    }
    const perm = Notification.permission;
    if (perm === "granted") {
      status.textContent = "알림 권한이 허용되었습니다. (탭을 열어 두면 동작합니다)";
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
      if (!("Notification" in window)) {
        updateStatus();
        return;
      }
      try {
        await Notification.requestPermission();
      } catch {
        // ignore
      }
      updateStatus();
    });
  }

  updateStatus();
}

purgeFutureIntakeLogs();
setupThemeToggle();
loadVitamins();
loadSlotLog();
loadNotifySettings();
loadNotifySent();
renderLegend();
renderVitaminPanel();
renderWeekdays();
renderCalendar();
renderDailySummary();
setupViewTabs();
setupDispenseSystem();
renderManage();
setupVitaminForm();
setupNotifySettings();
startNotificationScheduler();

document.getElementById("btn-prev").addEventListener("click", () => goMonth(-1));
document.getElementById("btn-next").addEventListener("click", () => goMonth(1));
document.getElementById("btn-today").addEventListener("click", goToday);

let calendarResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(calendarResizeTimer);
  calendarResizeTimer = setTimeout(renderCalendar, 160);
});
