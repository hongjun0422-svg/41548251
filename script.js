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
 * @typedef {{ id: string; name: string; ingredients: string; memberId: string; dosage: string }} Vitamin
 */

/**
 * 날짜별 복용 기록 (오늘 및 과거만 샘플로 채움)
 * @type {Record<string, Record<string, boolean>>}
 */
const INTAKE_LOG = {};

const _initial = new Date();
let viewYear = _initial.getFullYear();
let viewMonth = _initial.getMonth();

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const THEME_STORAGE_KEY = "vitaminTheme";
const VITAMIN_STORAGE_KEY = "vitaminRegistry";

/** @type {Vitamin[]} */
let VITAMINS = [];

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

/** @returns {Vitamin[]} */
function defaultVitamins() {
  return [
    {
      id: uuid(),
      memberId: "m1",
      name: "종합비타민",
      dosage: "1정",
      ingredients: "비타민 A, B군, C, D, E, 미네랄",
    },
    {
      id: uuid(),
      memberId: "m1",
      name: "유산균",
      dosage: "1캡슐",
      ingredients: "프로바이오틱스, 프리바이오틱스",
    },
    {
      id: uuid(),
      memberId: "m2",
      name: "오메가3",
      dosage: "1캡슐",
      ingredients: "EPA/DHA, 비타민E",
    },
    {
      id: uuid(),
      memberId: "m2",
      name: "밀크시슬",
      dosage: "1정",
      ingredients: "실리마린",
    },
    {
      id: uuid(),
      memberId: "m3",
      name: "어린이 종합비타민",
      dosage: "1정",
      ingredients: "비타민/미네랄 (어린이용 배합)",
    },
    {
      id: uuid(),
      memberId: "m3",
      name: "칼슘",
      dosage: "1정",
      ingredients: "칼슘, 비타민D",
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
        .map((x) => ({
          id: String(x.id || uuid()),
          name: String(x.name || ""),
          ingredients: String(x.ingredients || ""),
          memberId: String(x.memberId || ""),
          dosage: String(x.dosage || ""),
        }))
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
                `<li><span class="vitamin-tag" title="${escapeHtml(v.ingredients)}">${escapeHtml(v.name)} · ${escapeHtml(v.dosage)}</span></li>`
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
    const status = getStatusForMember(key, m.id);
    const vitamins = vitaminsForMember(m.id);
    const vlist =
      vitamins.length > 0
        ? vitamins
            .map(
              (v) =>
                `<span class="daily-vtag" title="${escapeHtml(v.ingredients)}">${escapeHtml(v.name)} · ${escapeHtml(v.dosage)}</span>`
            )
            .join("")
        : "";
    const vitaminsBlock = vlist
      ? `<div class="daily-row__vitamins" aria-label="복용 중인 비타민">${vlist}</div>`
      : "";

    return `<div class="daily-row daily-row--${status}">
      <div class="daily-row__main">
        <span class="daily-row__avatar" style="--member:${m.color}">${escapeHtml(memberInitial(m.name))}</span>
        <div class="daily-row__meta">
          <span class="daily-row__name">${escapeHtml(m.name)}</span>
          ${vitaminsBlock}
        </div>
      </div>
      <div class="daily-row__state">
        <span class="daily-row__label">${escapeHtml(labelStatus(status))}</span>
        <span class="daily-row__ico">${statusIconSvg(status)}</span>
      </div>
    </div>`;
  }).join("");
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

function renderCalendar() {
  ensureMonthSample(viewYear, viewMonth);

  const label = document.getElementById("month-label");
  if (label) label.textContent = `${viewYear}년 ${viewMonth + 1}월`;

  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
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

    if (isToday) {
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

    if (futureInMonth || futurePadding) {
      const note = document.createElement("div");
      note.className = "cell-future-note";
      note.textContent = "기록 없음";
      usersEl.appendChild(note);
    } else {
      MEMBERS.forEach((m) => {
        const status = outside ? "none" : getStatusForMember(key, m.id);
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

function setupViewTabs() {
  const views = document.getElementById("views");
  const tabDaily = document.getElementById("tab-daily");
  const tabCal = document.getElementById("tab-calendar");
  const tabManage = document.getElementById("tab-manage");
  if (!views || !tabDaily || !tabCal || !tabManage) return;

  const tabs = [
    { key: "daily", tab: tabDaily },
    { key: "calendar", tab: tabCal },
    { key: "manage", tab: tabManage },
  ];

  function activate(which) {
    views.classList.toggle("tab-daily", which === "daily");
    views.classList.toggle("tab-calendar", which === "calendar");
    views.classList.toggle("tab-manage", which === "manage");
    tabs.forEach(({ key, tab }) => {
      const on = key === which;
      tab.classList.toggle("view-tab--active", on);
      tab.setAttribute("aria-selected", String(on));
    });
  }

  tabDaily.addEventListener("click", () => activate("daily"));
  tabCal.addEventListener("click", () => activate("calendar"));
  tabManage.addEventListener("click", () => activate("manage"));
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

    if (!name || !dosage || !ingredients || !memberId) {
      msg.textContent = "모든 항목을 입력해 주세요.";
      msg.className = "form-msg form-msg--err";
      return;
    }

    VITAMINS.unshift({ id: uuid(), name, dosage, ingredients, memberId });
    saveVitamins();

    /** @type {HTMLInputElement} */ (document.getElementById("v-name")).value = "";
    /** @type {HTMLInputElement} */ (document.getElementById("v-dosage")).value = "";
    /** @type {HTMLTextAreaElement} */ (document.getElementById("v-ingredients")).value = "";

    msg.textContent = `${memberName(memberId)}에게 '${name}'이(가) 등록되었습니다.`;
    msg.className = "form-msg form-msg--ok";

    renderManage();
    renderVitaminPanel();
    renderDailySummary();
  });
}

purgeFutureIntakeLogs();
setupThemeToggle();
loadVitamins();
renderLegend();
renderVitaminPanel();
renderWeekdays();
renderCalendar();
renderDailySummary();
setupViewTabs();
renderManage();
setupVitaminForm();

document.getElementById("btn-prev").addEventListener("click", () => goMonth(-1));
document.getElementById("btn-next").addEventListener("click", () => goMonth(1));
document.getElementById("btn-today").addEventListener("click", goToday);
