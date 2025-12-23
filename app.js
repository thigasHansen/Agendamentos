// app.js

// Config
const START_MONTH = 11; // December is 11 (0-based)
const START_YEAR = 2025;
const END_MONTH = 11;   // December
const END_YEAR = 2026;
const DEFAULT_COLOR = "#6AA9FF";
const DAILY_LIMIT = 6000000; // Easy to edit in code

// State
let currentUser = null;
let userRole = "normal";
let currentYear = START_YEAR;
let currentMonth = START_MONTH;
let selectedDate = new Date(START_YEAR, START_MONTH, 1);
let eventsCache = new Map(); // key: YYYY-MM-DD => array of events
let nameColorMap = new Map(); // normalizedName => color

// DOM
const authSection = document.getElementById("authSection");
const calendarSection = document.getElementById("calendarSection");
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const logoutBtn = document.getElementById("logoutBtn");
const roleBadge = document.getElementById("roleBadge");

const monthTitle = document.getElementById("monthTitle");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const calendarGrid = document.getElementById("calendarGrid");

const selectedDateLabel = document.getElementById("selectedDateLabel");
const sumTotal = document.getElementById("sumTotal");
const sumUsed = document.getElementById("sumUsed");
const sumRemaining = document.getElementById("sumRemaining");

const eventForm = document.getElementById("eventForm");
const eventName = document.getElementById("eventName");
const eventValue = document.getElementById("eventValue");
const eventColor = document.getElementById("eventColor");
const eventList = document.getElementById("eventList");

const pillTemplate = document.getElementById("pillTemplate");
const eventItemTemplate = document.getElementById("eventItemTemplate");

// Utility
const fmtDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const normalizeName = (s) => s.trim().toLowerCase();

const inRange = (y, m) => {
  const start = new Date(START_YEAR, START_MONTH, 1).getTime();
  const end = new Date(END_YEAR, END_MONTH + 1, 0).getTime();
  const testStart = new Date(y, m, 1).getTime();
  const testEnd = new Date(y, m + 1, 0).getTime();
  return testStart >= start && testEnd <= end;
};

// Auth
async function init() {
  const session = await getSession();
  if (session) {
    currentUser = session.user;
    userRole = (currentUser.user_metadata && currentUser.user_metadata.role) || "normal";
    roleBadge.textContent = `Role: ${userRole}`;
    showCalendar();
  } else {
    showAuth();
  }
}

function showAuth() {
  authSection.classList.remove("hidden");
  calendarSection.classList.add("hidden");
}

function showCalendar() {
  authSection.classList.add("hidden");
  calendarSection.classList.remove("hidden");
  renderMonthHeader();
  loadMonthEvents(currentYear, currentMonth);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const pwd = passwordInput.value.trim();
  const { data, error } = await signIn(email, pwd);
  if (error) {
    alert("Login failed.");
    return;
  }
  currentUser = data.user;
  userRole = (currentUser.user_metadata && currentUser.user_metadata.role) || "normal";
  roleBadge.textContent = `Role: ${userRole}`;
  showCalendar();
});

logoutBtn.addEventListener("click", async () => {
  await signOut();
  currentUser = null;
  nameColorMap.clear();
  eventsCache.clear();
  showAuth();
});

// Month navigation
prevMonthBtn.addEventListener("click", () => {
  const m = currentMonth - 1;
  const y = m < 0 ? currentYear - 1 : currentYear;
  const newM = (m + 12) % 12;
  if (inRange(y, newM)) {
    currentMonth = newM;
    currentYear = y;
    renderMonthHeader();
    loadMonthEvents(currentYear, currentMonth);
  }
});
nextMonthBtn.addEventListener("click", () => {
  const m = currentMonth + 1;
  const y = m > 11 ? currentYear + 1 : currentYear;
  const newM = m % 12;
  if (inRange(y, newM)) {
    currentMonth = newM;
    currentYear = y;
    renderMonthHeader();
    loadMonthEvents(currentYear, currentMonth);
  }
});

function renderMonthHeader() {
  const date = new Date(currentYear, currentMonth, 1);
  monthTitle.textContent = date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

// Load events for month
async function loadMonthEvents(year, month) {
  eventsCache.clear();
  nameColorMap.clear();

  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const fromStr = fmtDateKey(from);
  const toStr = fmtDateKey(to);

  // Leaders can fetch all; normals fetch own
  let query = supabase.from("events").select("*").gte("date", fromStr).lte("date", toStr);
  if (userRole !== "leader") {
    query = query.eq("user_id", currentUser.id);
  }
  const { data, error } = await query.order("date", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    alert("Failed to load events.");
    return;
  }

  // Cache by day, and build name -> color map
  for (const ev of data) {
    const key = ev.date;
    if (!eventsCache.has(key)) eventsCache.set(key, []);
    eventsCache.get(key).push(ev);

    const nn = normalizeName(ev.name);
    if (!nameColorMap.has(nn)) {
      nameColorMap.set(nn, ev.color || DEFAULT_COLOR);
    }
  }

  renderCalendar(year, month);
}

function renderCalendar(year, month) {
  calendarGrid.innerHTML = "";

  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingWeekday = firstDayOfMonth.getDay(); // 0=Sunday
  const today = new Date();

  // Weekday headers (optional): skipping per request to keep clean

  // Fill leading empty cells
  for (let i = 0; i < startingWeekday; i++) {
    const cell = document.createElement("div");
    cell.className = "day-cell";
    calendarGrid.appendChild(cell);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const key = fmtDateKey(dateObj);

    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (fmtDateKey(selectedDate) === key) cell.classList.add("selected");

    const label = document.createElement("div");
    label.className = "date-label";
    label.textContent = d;
    cell.appendChild(label);

    // Render pills
    const events = eventsCache.get(key) || [];
    for (const ev of events) {
      const pillNode = pillTemplate.content.cloneNode(true);
      const pill = pillNode.querySelector(".pill");
      const chk = pillNode.querySelector(".pill-check");
      const txt = pillNode.querySelector(".pill-text");

      // Color by name consistency
      const nn = normalizeName(ev.name);
      const color = nameColorMap.get(nn) || ev.color || DEFAULT_COLOR;
      pill.style.background = color;

      chk.checked = !!ev.done;
      txt.textContent = `${ev.name} — ${Number(ev.value)}`;
      if (ev.done) txt.classList.add("strike");

      // Toggle done directly
      chk.addEventListener("change", async (e) => {
        const { error } = await supabase.from("events").update({ done: e.target.checked }).eq("id", ev.id);
        if (error) {
          alert("Failed to update.");
          chk.checked = !chk.checked;
          return;
        }
        ev.done = e.target.checked;
        updateSelectedDaySummary();
        txt.classList.toggle("strike", ev.done);
      });

      // Clicking pill opens edit/delete
      pill.addEventListener("click", () => openEditDialog(ev));

      cell.appendChild(pillNode);
    }

    cell.addEventListener("click", () => {
      selectedDate = dateObj;
      document.querySelectorAll(".day-cell").forEach(c => c.classList.remove("selected"));
      cell.classList.add("selected");
      selectedDateLabel.textContent = key;
      renderEventPanelForDay(key);
      updateSelectedDaySummary();
    });

    // Set default selected date if month changes
    if (d === 1 && (fmtDateKey(selectedDate).slice(0,7) !== key.slice(0,7))) {
      selectedDate = dateObj;
      selectedDateLabel.textContent = key;
    }

    calendarGrid.appendChild(cell);
  }

  // After rendering, update panel and summary
  renderEventPanelForDay(fmtDateKey(selectedDate));
  updateSelectedDaySummary();
}

// Panel list and form
eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = eventName.value.trim();
  const value = Number(eventValue.value);
  const color = eventColor.value || DEFAULT_COLOR;

  if (!name || isNaN(value)) return;

  const dateKey = fmtDateKey(selectedDate);
  const insertPayload = {
    user_id: currentUser.id,
    date: dateKey,
    name,
    value,
    color,
    done: false
  };

  const { data, error } = await supabase.from("events").insert(insertPayload).select("*").single();
  if (error) {
    alert("Failed to add event.");
    return;
  }

  // Update caches
  const nn = normalizeName(name);
  nameColorMap.set(nn, color);

  const arr = eventsCache.get(dateKey) || [];
  arr.push(data);
  eventsCache.set(dateKey, arr);

  eventName.value = "";
  eventValue.value = "";
  eventColor.value = color;

  renderCalendar(currentYear, currentMonth);
});

function renderEventPanelForDay(dateKey) {
  eventList.innerHTML = "";
  selectedDateLabel.textContent = dateKey;
  const events = eventsCache.get(dateKey) || [];

  for (const ev of events) {
    const itemNode = eventItemTemplate.content.cloneNode(true);
    const li = itemNode.querySelector(".event-item");
    const chk = itemNode.querySelector(".item-check");
    const txt = itemNode.querySelector(".item-text");
    const editBtn = itemNode.querySelector(".edit-btn");
    const delBtn = itemNode.querySelector(".delete-btn");

    const nn = normalizeName(ev.name);
    const color = nameColorMap.get(nn) || ev.color || DEFAULT_COLOR;

    txt.textContent = `${ev.name} — ${Number(ev.value)}`;
    if (ev.done) txt.classList.add("strike");
    li.style.borderLeft = `4px solid ${color}`;

    chk.checked = !!ev.done;
    chk.addEventListener("change", async (e) => {
      const { error } = await supabase.from("events").update({ done: e.target.checked }).eq("id", ev.id);
      if (error) {
        alert("Failed to update.");
        chk.checked = !chk.checked;
        return;
      }
      ev.done = e.target.checked;
      txt.classList.toggle("strike", ev.done);
      renderCalendar(currentYear, currentMonth);
    });

    // Permissions: normal users can only edit/delete their own
    const canEdit = userRole === "leader" || ev.user_id === currentUser.id;
    if (!canEdit) {
      editBtn.disabled = true;
      delBtn.disabled = true;
      editBtn.title = "Leader-only or owner-only";
      delBtn.title = "Leader-only or owner-only";
    }

    editBtn.addEventListener("click", () => openEditDialog(ev));
    delBtn.addEventListener("click", () => deleteEvent(ev));

    eventList.appendChild(itemNode);
  }
}

function updateSelectedDaySummary() {
  const dateKey = fmtDateKey(selectedDate);
  const events = eventsCache.get(dateKey) || [];
  const total = events.reduce((acc, ev) => acc + Number(ev.value || 0), 0);
  const used = events.filter(ev => ev.done).reduce((acc, ev) => acc + Number(ev.value || 0), 0);
  const remaining = Math.max(0, DAILY_LIMIT - used);

  sumTotal.textContent = total;
  sumUsed.textContent = used;
  sumRemaining.textContent = remaining;
}

// Edit/delete dialog
function openEditDialog(ev) {
  const canEdit = userRole === "leader" || ev.user_id === currentUser.id;
  if (!canEdit) {
    alert("You can only edit your own events.");
    return;
  }

  const newName = prompt("Edit name:", ev.name);
  if (newName === null) return;

  const newValueStr = prompt("Edit value:", String(ev.value));
  if (newValueStr === null) return;
  const newValue = Number(newValueStr);
  if (isNaN(newValue)) {
    alert("Invalid value.");
    return;
  }

  const newColor = prompt("Edit color (hex like #ff9900):", ev.color || DEFAULT_COLOR);
  if (newColor === null) return;

  // Update the selected event
  supabase.from("events").update({ name: newName.trim(), value: newValue, color: newColor })
    .eq("id", ev.id)
    .select("*")
    .single()
    .then(({ data, error }) => {
      if (error) {
        alert("Failed to update event.");
        return;
      }

      // Replace in cache
      const dateKey = ev.date;
      const list = eventsCache.get(dateKey) || [];
      const idx = list.findIndex(e => e.id === ev.id);
      if (idx >= 0) list[idx] = data;
      eventsCache.set(dateKey, list);

      // Color consistency by name (case-insensitive)
      const oldNN = normalizeName(ev.name);
      const newNN = normalizeName(data.name);
      nameColorMap.delete(oldNN);
      nameColorMap.set(newNN, data.color || DEFAULT_COLOR);

      // Apply color to all pills with same name:
      // Leader: update all matching name, Normal: update only user's matching name.
      const scopeQuery = supabase.from("events").update({ color: data.color }).eq("name", data.name);
      let finalQuery = scopeQuery;
      if (userRole !== "leader") {
        finalQuery = finalQuery.eq("user_id", currentUser.id);
      }
      finalQuery.then(({ error }) => {
        if (error) {
          // Non-blocking: UI still uses nameColorMap
          console.warn("Color consistency update failed");
        }
        // Reload the month view to reflect updates
        renderCalendar(currentYear, currentMonth);
      });
    });
}

async function deleteEvent(ev) {
  const canDelete = userRole === "leader" || ev.user_id === currentUser.id;
  if (!canDelete) {
    alert("You can only delete your own events.");
    return;
  }
  const ok = confirm("Delete this event?");
  if (!ok) return;

  const { error } = await supabase.from("events").delete().eq("id", ev.id);
  if (error) {
    alert("Failed to delete.");
    return;
  }

  const dateKey = ev.date;
  const list = eventsCache.get(dateKey) || [];
  eventsCache.set(dateKey, list.filter(e => e.id !== ev.id));
  renderCalendar(currentYear, currentMonth);
}

// Initialize
document.addEventListener("DOMContentLoaded", init);
