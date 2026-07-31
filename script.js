/**
 * Aura Habit Tracker - Core Application Logic
 * Implements offline state sync, startup prompt flow, charts renderer,
 * calendar rendering, streaks/KPI analyzer, confetti, & keyboard triggers.
 */

// ==========================================================================
// 1. Data Structures & Default Seed Configurations
// ==========================================================================

const MOTIVATIONAL_QUOTES = [
    { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
    { text: "Your habits will determine your future.", author: "Jack Canfield" },
    { text: "Atomic habits compound over time. 1% better every day leads to massive growth.", author: "James Clear" },
    { text: "It is easier to prevent bad habits than to break them.", author: "Benjamin Franklin" },
    { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "The secret of your future is hidden in your daily routine.", author: "Mike Murdock" }
];

const DEFAULT_HABITS = [
    {
        id: "default-yoga",
        name: "Morning Yoga & Stretch",
        time: "07:00",
        color: "#10b981", // Emerald
        icon: "dumbbell",
        category: "Fitness",
        priority: "High",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "default-water",
        name: "Drink 3 Liters Water",
        time: "09:00",
        color: "#3b82f6", // Blue
        icon: "heart",
        category: "Health",
        priority: "High",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "default-read",
        name: "Read 15 Pages of a Book",
        time: "21:00",
        color: "#8b5cf6", // Purple
        icon: "book",
        category: "Mind",
        priority: "Medium",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    }
];

// Helper to get past dates in YYYY-MM-DD
function getPastDateString(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
}

// Generate sample log logs for seeding
function generateSeedLogs() {
    const logs = {};
    // Seed logs for the past 8 days
    for (let i = 1; i <= 8; i++) {
        const dateStr = getPastDateString(i);
        logs[dateStr] = {};
        
        // Randomly complete/skip/pend habits to make charts look beautiful
        DEFAULT_HABITS.forEach(h => {
            const rand = Math.random();
            if (rand > 0.3) {
                logs[dateStr][h.id] = "completed";
            } else if (rand > 0.1) {
                logs[dateStr][h.id] = "skipped";
            } else {
                logs[dateStr][h.id] = "pending";
            }
        });
    }
    return logs;
}

// Global Application State Variables
let state = {
    habits: [],
    dailyLogs: {},
    settings: {
        theme: "dark",
        accentColor: "blue"
    }
};

// ==========================================================================
// 2. Storage & Backup Controllers
// ==========================================================================

function loadStateFromStorage() {
    try {
        const habitsStr = localStorage.getItem("aura_habits");
        const logsStr = localStorage.getItem("aura_daily_logs");
        const settingsStr = localStorage.getItem("aura_settings");

        if (habitsStr && logsStr) {
            state.habits = JSON.parse(habitsStr);
            state.dailyLogs = JSON.parse(logsStr);
        } else {
            // First time opening app: Seed beautiful data!
            state.habits = [...DEFAULT_HABITS];
            state.dailyLogs = generateSeedLogs();
            saveStateToStorage();
        }

        if (settingsStr) {
            state.settings = JSON.parse(settingsStr);
        }
    } catch (e) {
        showToast("Error loading storage ledger, initializing empty.", "error");
        state.habits = [...DEFAULT_HABITS];
        state.dailyLogs = {};
    }
}

function saveStateToStorage() {
    localStorage.setItem("aura_habits", JSON.stringify(state.habits));
    localStorage.setItem("aura_daily_logs", JSON.stringify(state.dailyLogs));
    localStorage.setItem("aura_settings", JSON.stringify(state.settings));
}

// ==========================================================================
// 3. Application Lifecycle, Setup Checks & Dialog Workflows
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    loadStateFromStorage();
    applyVisualSettings();
    initializeClock();
    setupRouting();
    setupFormsPickers();
    setupActionListeners();
    registerKeyboardShortcuts();
    triggerStartupCheck();
    rotateQuote();
    
    // Default render
    navigatePage("dashboard");
});

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function getYesterdayString() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
}

function triggerStartupCheck() {
    const today = getTodayString();
    const yesterday = getYesterdayString();
    
    // If no habits exist, skip prompts
    if (state.habits.length === 0) return;

    // Check yesterday log
    const yesterdayLog = state.dailyLogs[yesterday];
    const hasYesterdayLog = yesterdayLog && Object.keys(yesterdayLog).length > 0;

    // Check today log
    const todayLog = state.dailyLogs[today];
    const hasTodayLog = todayLog && Object.keys(todayLog).length > 0;

    if (!hasYesterdayLog) {
        // Yesterday's logs are missing
        const modal = document.getElementById("modal-startup-prompt");
        const msg = document.getElementById("startup-prompt-message");
        const actBtn = document.getElementById("btn-startup-action");

        msg.textContent = "You haven't completed yesterday's habits ledger yet.";
        actBtn.textContent = "Log Yesterday First";
        
        actBtn.onclick = () => {
            closeModal("modal-startup-prompt");
            openDateDetailsModal(yesterday);
            // Once yesterday is closed, offer to log today
            document.getElementById("btn-close-date-details").addEventListener("click", promptForTodayOnce, { once: true });
            document.getElementById("btn-close-date-details-footer").addEventListener("click", promptForTodayOnce, { once: true });
        };

        const skipBtn = document.getElementById("btn-startup-skip");
        skipBtn.onclick = () => {
            closeModal("modal-startup-prompt");
            // Auto initialize yesterday as empty logs
            initializeDayLog(yesterday, "pending");
            promptForTodayOnce();
        };

        openModal("modal-startup-prompt");
    } else if (!hasTodayLog) {
        // Yesterday is logged, but today is not
        promptForTodayOnce();
    } else {
        // Check logs for today match current habits
        syncDayLogs(today);
    }
}

function promptForTodayOnce() {
    const today = getTodayString();
    if (!state.dailyLogs[today] || Object.keys(state.dailyLogs[today]).length === 0) {
        const modal = document.getElementById("modal-startup-prompt");
        const msg = document.getElementById("startup-prompt-message");
        const actBtn = document.getElementById("btn-startup-action");

        msg.textContent = "Start tracking today's habits to maintain your streak!";
        actBtn.textContent = "Let's log Today's Actions";

        actBtn.onclick = () => {
            closeModal("modal-startup-prompt");
            initializeDayLog(today, "pending");
            navigatePage("dashboard");
            showToast("Today's ledger initialized!", "info");
        };

        const skipBtn = document.getElementById("btn-startup-skip");
        skipBtn.onclick = () => {
            closeModal("modal-startup-prompt");
            initializeDayLog(today, "pending");
        };

        openModal("modal-startup-prompt");
    }
}

// Initialise daily completion grid mapping
function initializeDayLog(dateStr, defaultStatus = "pending") {
    if (!state.dailyLogs[dateStr]) {
        state.dailyLogs[dateStr] = {};
    }
    state.habits.forEach(h => {
        if (!state.dailyLogs[dateStr][h.id]) {
            state.dailyLogs[dateStr][h.id] = defaultStatus;
        }
    });
    saveStateToStorage();
    refreshAllViews();
}

// Keep daily check lists synchronized with currently active habits template
function syncDayLogs(dateStr) {
    if (!state.dailyLogs[dateStr]) {
        state.dailyLogs[dateStr] = {};
    }
    let updated = false;
    state.habits.forEach(h => {
        if (!state.dailyLogs[dateStr][h.id]) {
            state.dailyLogs[dateStr][h.id] = "pending";
            updated = true;
        }
    });
    if (updated) {
        saveStateToStorage();
    }
}

// ==========================================================================
// 4. Live Clock & Calendar Timestamps Helper
// ==========================================================================

function initializeClock() {
    const liveTime = document.getElementById("live-time");
    const liveDate = document.getElementById("live-date");

    function update() {
        const now = new Date();
        // Time
        let hours = now.getHours();
        let minutes = now.getMinutes();
        hours = hours < 10 ? '0' + hours : hours;
        minutes = minutes < 10 ? '0' + minutes : minutes;
        liveTime.textContent = `${hours}:${minutes}`;

        // Date
        const options = { month: 'long', day: 'numeric', year: 'numeric' };
        liveDate.textContent = now.toLocaleDateString('en-US', options);
    }
    update();
    setInterval(update, 1000);
}

function rotateQuote() {
    const rand = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    document.getElementById("quote-display").textContent = `"${rand.text}"`;
    document.getElementById("quote-author").textContent = `- ${rand.author}`;
}

// ==========================================================================
// 5. Page Navigation & Routing Control
// ==========================================================================

function setupRouting() {
    const navItems = document.querySelectorAll(".nav-item, .bottom-nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const pageId = item.getAttribute("data-page");
            navigatePage(pageId);
        });
    });
}

function navigatePage(pageId) {
    // Toggle page view elements
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.add("active");
    }

    // Toggle nav active classes
    document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(item => {
        if (item.getAttribute("data-page") === pageId) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Update global headers titles
    const titleEl = document.getElementById("page-title");
    const subtitleEl = document.getElementById("page-subtitle");
    
    switch (pageId) {
        case "dashboard":
            titleEl.textContent = "Dashboard";
            subtitleEl.textContent = "A visual checklist of your daily habits.";
            break;
        case "habits":
            titleEl.textContent = "Habits Manager";
            subtitleEl.textContent = "Create, edit, duplicate or delete habit templates.";
            break;
        case "calendar":
            titleEl.textContent = "Monthly Checkins";
            subtitleEl.textContent = "Interactive retroactive completion logs grid.";
            break;
        case "reports":
            titleEl.textContent = "Reports & Analytics";
            subtitleEl.textContent = "View automated trends, category averages, and consistency heatmap.";
            break;
        case "settings":
            titleEl.textContent = "System Settings";
            subtitleEl.textContent = "Personalize colors, export data backups, or clean database.";
            break;
    }

    refreshAllViews();
}

function refreshAllViews() {
    const activePage = document.querySelector(".page.active");
    if (!activePage) return;

    const pageId = activePage.id.replace("page-", "");
    
    // Sync current day logs first
    syncDayLogs(getTodayString());

    switch (pageId) {
        case "dashboard":
            renderDashboardPage();
            break;
        case "habits":
            renderHabitsPage();
            break;
        case "calendar":
            renderCalendarPage();
            break;
        case "reports":
            renderReportsPage();
            break;
        case "settings":
            renderSettingsPage();
            break;
    }
}

// ==========================================================================
// 6. UI Modals Form Controllers & Helpers
// ==========================================================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
    }
}

function setupFormsPickers() {
    // Form colors picker selection
    const colorDots = document.querySelectorAll(".color-dot");
    colorDots.forEach(dot => {
        dot.addEventListener("click", () => {
            colorDots.forEach(d => d.classList.remove("active"));
            dot.classList.add("active");
        });
    });

    // Form icons selector selection
    const iconBtns = document.querySelectorAll(".icon-selector-btn");
    iconBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            iconBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });
}

function setupActionListeners() {
    // Quick Add Header Buttons
    document.getElementById("btn-quick-add").addEventListener("click", () => openHabitFormModal());
    document.getElementById("btn-floating-add").addEventListener("click", () => openHabitFormModal());
    document.getElementById("btn-empty-add").addEventListener("click", () => openHabitFormModal());

    // Habit Modal Closes
    document.getElementById("btn-close-habit-modal").addEventListener("click", () => closeModal("modal-habit-form"));
    document.getElementById("btn-cancel-habit").addEventListener("click", () => closeModal("modal-habit-form"));

    // Date Details Closes
    document.getElementById("btn-close-date-details").addEventListener("click", () => closeModal("modal-date-details"));
    document.getElementById("btn-close-date-details-footer").addEventListener("click", () => closeModal("modal-date-details"));

    // Habit Form Submission
    document.getElementById("habit-form").addEventListener("submit", handleHabitFormSubmit);

    // Live searches & filters inside habits list
    document.getElementById("habit-search-input").addEventListener("input", renderHabitsPage);
    document.getElementById("filter-category").addEventListener("change", renderHabitsPage);
    document.getElementById("filter-priority").addEventListener("change", renderHabitsPage);
    document.getElementById("sort-manager-select").addEventListener("change", renderHabitsPage);
    document.getElementById("sort-today-select").addEventListener("change", renderDashboardPage);

    // Shortcuts Modal Closes
    document.getElementById("btn-close-shortcuts-modal").addEventListener("click", () => closeModal("modal-shortcuts"));
    document.getElementById("btn-close-shortcuts-footer").addEventListener("click", () => closeModal("modal-shortcuts"));
    document.getElementById("btn-help-trigger").addEventListener("click", () => openModal("modal-shortcuts"));

    // Calendar navigators
    document.getElementById("calendar-prev-month").addEventListener("click", navigatePreviousMonth);
    document.getElementById("calendar-next-month").addEventListener("click", navigateNextMonth);
}

// Dynamic Dialog Confirmation Helper
function showConfirmDialog(title, description, onProceed) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-desc").textContent = description;
    
    openModal("modal-confirm");
    
    document.getElementById("btn-confirm-ok").onclick = () => {
        onProceed();
        closeModal("modal-confirm");
    };
    
    document.getElementById("btn-confirm-cancel").onclick = () => {
        closeModal("modal-confirm");
    };
}

// Custom Toast Alerts System
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = "none"; // Reset for exit
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.4s ease-out";
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// ==========================================================================
// 7. Today Dashboard Renderer & Check-in handlers
// ==========================================================================

function renderDashboardPage() {
    const container = document.getElementById("today-habits-container");
    container.innerHTML = "";
    
    if (state.habits.length === 0) {
        document.getElementById("today-empty-state").style.display = "flex";
        document.getElementById("today-habits-container").style.display = "none";
        updateCompletionMetrics(getTodayString());
        return;
    }

    document.getElementById("today-empty-state").style.display = "none";
    document.getElementById("today-habits-container").style.display = "flex";

    const todayStr = getTodayString();
    syncDayLogs(todayStr);

    const sortVal = document.getElementById("sort-today-select").value;
    const sortedHabits = sortHabits(state.habits, sortVal, todayStr);

    sortedHabits.forEach(habit => {
        const status = state.dailyLogs[todayStr][habit.id] || "pending";
        const row = createTodayHabitRow(habit, status, todayStr);
        container.appendChild(row);
    });

    updateCompletionMetrics(todayStr);
}

function createTodayHabitRow(habit, status, dateStr) {
    const row = document.createElement("div");
    row.className = `today-habit-row ${status}`;
    row.setAttribute("data-habit-id", habit.id);

    const leftCol = document.createElement("div");
    leftCol.className = "today-habit-left";

    // Custom Checkbox
    const chk = document.createElement("div");
    chk.className = "checkbox-custom";
    chk.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>`;
    chk.onclick = (e) => {
        e.stopPropagation();
        toggleHabitCheck(habit.id, dateStr);
    };

    // Category Color Icon Frame
    const iconBox = document.createElement("div");
    iconBox.className = "today-habit-icon-box";
    iconBox.style.backgroundColor = habit.color;
    iconBox.innerHTML = getIconSvg(habit.icon);

    // Habit Info Titles
    const info = document.createElement("div");
    info.className = "today-habit-info";
    
    const nameSpan = document.createElement("span");
    nameSpan.className = "today-habit-name";
    nameSpan.textContent = habit.name;

    const metaRow = document.createElement("div");
    metaRow.className = "today-habit-meta-row";
    
    const timeSpan = document.createElement("span");
    timeSpan.className = "today-habit-time-badge";
    timeSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${formatTime(habit.time)}`;

    const catSpan = document.createElement("span");
    catSpan.className = "today-habit-category";
    catSpan.textContent = habit.category;

    const prioritySpan = document.createElement("span");
    prioritySpan.className = `today-habit-priority-badge priority-${habit.priority.toLowerCase()}`;
    prioritySpan.textContent = habit.priority;

    metaRow.appendChild(timeSpan);
    metaRow.appendChild(document.createTextNode("•"));
    metaRow.appendChild(catSpan);
    metaRow.appendChild(document.createTextNode("•"));
    metaRow.appendChild(prioritySpan);

    info.appendChild(nameSpan);
    info.appendChild(metaRow);

    leftCol.appendChild(chk);
    leftCol.appendChild(iconBox);
    leftCol.appendChild(info);

    // Action toggler buttons
    const rightCol = document.createElement("div");
    rightCol.className = "today-habit-right";

    if (status === "pending") {
        rightCol.innerHTML = `
            <button class="btn-action-circle act-complete" title="Mark Complete" aria-label="Mark Complete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="btn-action-circle act-skip" title="Mark Skipped" aria-label="Mark Skipped">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;
    } else {
        rightCol.innerHTML = `
            <button class="btn-action-circle act-pending" title="Mark Pending" aria-label="Mark Pending">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
        `;
    }

    // Set buttons actions
    const completeBtn = rightCol.querySelector(".act-complete");
    const skipBtn = rightCol.querySelector(".act-skip");
    const pendingBtn = rightCol.querySelector(".act-pending");

    if (completeBtn) {
        completeBtn.onclick = () => updateHabitStatus(habit.id, "completed", dateStr);
    }
    if (skipBtn) {
        skipBtn.onclick = () => updateHabitStatus(habit.id, "skipped", dateStr);
    }
    if (pendingBtn) {
        pendingBtn.onclick = () => updateHabitStatus(habit.id, "pending", dateStr);
    }

    row.appendChild(leftCol);
    row.appendChild(rightCol);

    return row;
}

// Complete togglers
function toggleHabitCheck(habitId, dateStr) {
    const current = state.dailyLogs[dateStr][habitId] || "pending";
    const nextStatus = current === "completed" ? "pending" : "completed";
    updateHabitStatus(habitId, nextStatus, dateStr);
}

function updateHabitStatus(habitId, status, dateStr) {
    if (!state.dailyLogs[dateStr]) {
        state.dailyLogs[dateStr] = {};
    }
    
    const previousStatus = state.dailyLogs[dateStr][habitId];
    state.dailyLogs[dateStr][habitId] = status;
    saveStateToStorage();

    // Trigger visual updates immediately
    const today = getTodayString();
    
    if (dateStr === today) {
        renderDashboardPage();
        
        // Confetti triggering on 100% completion
        if (status === "completed" && previousStatus !== "completed") {
            const stats = getDayCompletionStats(today);
            if (stats.completed === stats.total && stats.total > 0) {
                triggerConfetti();
                showToast("100% Day Completed! Keep it up!", "success");
            } else {
                showToast("Habit complete!", "success");
            }
        }
    } else {
        // Retroactive edits
        const parentModal = document.getElementById("modal-date-details");
        if (parentModal.classList.contains("active")) {
            renderDateDetailsList(dateStr);
        }
    }
}

// Update dashboard completion progress components
function updateCompletionMetrics(dateStr) {
    const stats = getDayCompletionStats(dateStr);
    const completionPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    
    // Circular Progress Update
    const circle = document.getElementById("dashboard-circular-fill");
    if (circle) {
        // Radius of 40 yields Circumference = 2 * PI * 40 ≈ 251.2
        const circumference = 251.2;
        const offset = circumference - (completionPercent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }

    document.getElementById("completion-percentage-badge").textContent = `${completionPercent}%`;
    document.getElementById("dashboard-completion-txt").textContent = `${completionPercent}%`;
    document.getElementById("dashboard-completion-fraction").textContent = `${stats.completed} / ${stats.total} Done`;

    // Metric Summary widgets values
    document.getElementById("count-completed").textContent = stats.completed;
    document.getElementById("count-pending").textContent = stats.pending;
    document.getElementById("count-remaining").textContent = stats.total - stats.completed;

    // Streak and longest
    const streakStats = calculateStreaks();
    document.getElementById("streak-current-val").textContent = streakStats.current;
    document.getElementById("streak-longest-val").textContent = `${streakStats.longest} days`;
    document.getElementById("streak-perfect-count").textContent = `${streakStats.perfectDays} days`;
}

// ==========================================================================
// 8. Habits Template Manager Layouts
// ==========================================================================

function renderHabitsPage() {
    const grid = document.getElementById("habits-manager-container");
    grid.innerHTML = "";

    const query = document.getElementById("habit-search-input").value.toLowerCase();
    const catFilter = document.getElementById("filter-category").value;
    const priFilter = document.getElementById("filter-priority").value;
    const sortVal = document.getElementById("sort-manager-select").value;

    let filtered = state.habits.filter(h => {
        const matchesQuery = h.name.toLowerCase().includes(query);
        const matchesCat = catFilter === "all" || h.category === catFilter;
        const matchesPri = priFilter === "all" || h.priority === priFilter;
        return matchesQuery && matchesCat && matchesPri;
    });

    if (filtered.length === 0) {
        document.getElementById("manager-empty-state").style.display = "flex";
        return;
    }

    document.getElementById("manager-empty-state").style.display = "none";
    
    // Sort
    filtered = sortHabits(filtered, sortVal);

    filtered.forEach(habit => {
        const card = createHabitManagerCard(habit);
        grid.appendChild(card);
    });
}

function createHabitManagerCard(habit) {
    const card = document.createElement("div");
    card.className = "habit-card glass-card";
    
    // Card color tint outline style
    card.style.borderTop = `4px solid ${habit.color}`;

    const head = document.createElement("div");
    head.className = "habit-card-header";

    const iconBox = document.createElement("div");
    iconBox.className = "habit-card-icon-box";
    iconBox.style.backgroundColor = habit.color;
    iconBox.innerHTML = getIconSvg(habit.icon);

    const actionRow = document.createElement("div");
    actionRow.className = "habit-card-actions";
    
    // Triple Option dropdown or quick action buttons (Edit, Duplicate, Delete)
    actionRow.innerHTML = `
        <button class="btn-action-circle btn-edit" title="Edit Habit" aria-label="Edit Habit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-action-circle btn-duplicate" title="Duplicate Habit" aria-label="Duplicate Habit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="btn-action-circle btn-delete" title="Delete Habit" aria-label="Delete Habit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
    `;

    actionRow.querySelector(".btn-edit").onclick = () => openHabitFormModal(habit);
    actionRow.querySelector(".btn-duplicate").onclick = () => duplicateHabit(habit.id);
    actionRow.querySelector(".btn-delete").onclick = () => deleteHabit(habit.id);

    head.appendChild(iconBox);
    head.appendChild(actionRow);

    const body = document.createElement("div");
    body.className = "habit-card-body";

    const title = document.createElement("h4");
    title.className = "habit-card-title";
    title.textContent = habit.name;

    const metaRow = document.createElement("div");
    metaRow.className = "habit-card-meta";

    const timeBadge = document.createElement("span");
    timeBadge.className = "habit-card-badge";
    timeBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${formatTime(habit.time)}`;

    const catBadge = document.createElement("span");
    catBadge.className = "habit-card-badge";
    catBadge.textContent = habit.category;

    const priBadge = document.createElement("span");
    priBadge.className = `habit-card-badge priority-${habit.priority.toLowerCase()}`;
    priBadge.textContent = habit.priority;

    metaRow.appendChild(timeBadge);
    metaRow.appendChild(catBadge);
    metaRow.appendChild(priBadge);

    body.appendChild(title);
    body.appendChild(metaRow);

    // Compute simple statistics for this habit
    const totalChecks = countHabitCheckins(habit.id);
    const completionRate = countHabitCompletionRate(habit.id);

    const footer = document.createElement("div");
    footer.className = "habit-card-footer";
    footer.innerHTML = `
        <span class="habit-card-stats">Success: <strong class="habit-card-stats-val">${completionRate}%</strong></span>
        <span class="habit-card-stats">Logs: <strong class="habit-card-stats-val">${totalChecks}</strong></span>
    `;

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(footer);

    return card;
}

// CRUD executioners
function openHabitFormModal(habit = null) {
    const form = document.getElementById("habit-form");
    form.reset();

    // Remove active styles on selectors
    document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
    document.querySelectorAll(".icon-selector-btn").forEach(b => b.classList.remove("active"));

    if (habit) {
        document.getElementById("habit-modal-title").textContent = "Edit Habit Template";
        document.getElementById("edit-habit-id").value = habit.id;
        document.getElementById("habit-name").value = habit.name;
        document.getElementById("habit-time").value = habit.time;
        document.getElementById("habit-category").value = habit.category;
        document.getElementById("habit-priority").value = habit.priority;

        // Set active color dot
        const colorDot = document.querySelector(`.color-dot[data-color="${habit.color}"]`);
        if (colorDot) colorDot.classList.add("active");
        else document.querySelector(".color-dot").classList.add("active");

        // Set active icon button
        const iconBtn = document.querySelector(`.icon-selector-btn[data-icon="${habit.icon}"]`);
        if (iconBtn) iconBtn.classList.add("active");
        else document.querySelector(".icon-selector-btn").classList.add("active");
    } else {
        document.getElementById("habit-modal-title").textContent = "Create New Habit";
        document.getElementById("edit-habit-id").value = "";
        
        // Defaults
        document.querySelector(".color-dot").classList.add("active");
        document.querySelector(".icon-selector-btn").classList.add("active");
    }

    openModal("modal-habit-form");
}

function handleHabitFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("edit-habit-id").value;
    const name = document.getElementById("habit-name").value.trim();
    const time = document.getElementById("habit-time").value;
    const category = document.getElementById("habit-category").value;
    const priority = document.getElementById("habit-priority").value;
    
    const activeColorDot = document.querySelector(".color-dot.active");
    const color = activeColorDot ? activeColorDot.getAttribute("data-color") : "#3b82f6";

    const activeIconBtn = document.querySelector(".icon-selector-btn.active");
    const icon = activeIconBtn ? activeIconBtn.getAttribute("data-icon") : "heart";

    if (!name) return;

    if (id) {
        // Modify edit
        const index = state.habits.findIndex(h => h.id === id);
        if (index > -1) {
            state.habits[index] = { ...state.habits[index], name, time, color, icon, category, priority };
            showToast("Habit template updated successfully!", "success");
        }
    } else {
        // Create new
        const newHabit = {
            id: 'habit_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            name,
            time,
            color,
            icon,
            category,
            priority,
            createdAt: new Date().toISOString()
        };
        state.habits.push(newHabit);
        
        // Sync logs for today
        const today = getTodayString();
        initializeDayLog(today, "pending");
        showToast("New habit added to dashboard!", "success");
    }

    saveStateToStorage();
    closeModal("modal-habit-form");
    refreshAllViews();
}

function duplicateHabit(habitId) {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;

    const duplicated = {
        ...habit,
        id: 'habit_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: `${habit.name} (Copy)`,
        createdAt: new Date().toISOString()
    };

    state.habits.push(duplicated);
    
    // Sync logs for today
    initializeDayLog(getTodayString(), "pending");
    
    saveStateToStorage();
    showToast("Habit duplicated successfully!", "success");
    refreshAllViews();
}

function deleteHabit(habitId) {
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;

    showConfirmDialog(
        "Delete Habit Template?",
        `Are you sure you want to permanently delete "${habit.name}"? Historical logs will remain archived, but this habit will be removed from your dashboard and schedule pages.`,
        () => {
            state.habits = state.habits.filter(h => h.id !== habitId);
            
            // Optionally clean today's active logs
            const today = getTodayString();
            if (state.dailyLogs[today]) {
                delete state.dailyLogs[today][habitId];
            }

            saveStateToStorage();
            showToast("Habit template deleted.", "info");
            refreshAllViews();
        }
    );
}

// Stats helper calculators
function countHabitCheckins(habitId) {
    let count = 0;
    Object.keys(state.dailyLogs).forEach(date => {
        if (state.dailyLogs[date][habitId] === "completed") {
            count++;
        }
    });
    return count;
}

function countHabitCompletionRate(habitId) {
    let checked = 0;
    let loggedDays = 0;
    Object.keys(state.dailyLogs).forEach(date => {
        const log = state.dailyLogs[date][habitId];
        if (log === "completed" || log === "pending" || log === "skipped") {
            loggedDays++;
            if (log === "completed") checked++;
        }
    });
    return loggedDays > 0 ? Math.round((checked / loggedDays) * 100) : 0;
}

// ==========================================================================
// 9. Interactive Calendar Rendering & Day logs checks
// ==========================================================================

let calendarCurrentMonth = new Date().getMonth();
let calendarCurrentYear = new Date().getFullYear();

function renderCalendarPage() {
    const label = document.getElementById("calendar-month-year-label");
    const grid = document.getElementById("calendar-days-grid");
    grid.innerHTML = "";

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    label.textContent = `${months[calendarCurrentMonth]} ${calendarCurrentYear}`;

    // Get first day and length of month
    const firstDayIndex = new Date(calendarCurrentYear, calendarCurrentMonth, 1).getDay();
    const daysInMonth = new Date(calendarCurrentYear, calendarCurrentMonth + 1, 0).getDate();

    // Create empty cells for start placeholders
    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement("div");
        empty.className = "calendar-day-cell empty";
        grid.appendChild(empty);
    }

    const todayStr = getTodayString();

    // Build actual month calendar days
    for (let day = 1; day <= daysInMonth; day++) {
        const cellDate = new Date(calendarCurrentYear, calendarCurrentMonth, day);
        const dateStr = cellDate.toISOString().split('T')[0];

        const cell = document.createElement("div");
        cell.className = "calendar-day-cell";
        if (dateStr === todayStr) {
            cell.classList.add("today");
        }

        const numSpan = document.createElement("span");
        numSpan.className = "calendar-day-number";
        numSpan.textContent = day;
        cell.appendChild(numSpan);

        // Completion Status coloring
        const stats = getDayCompletionStats(dateStr);
        
        const isFuture = cellDate > new Date();

        if (isFuture) {
            // Future cells colored Gray
            const ind = document.createElement("div");
            ind.className = "day-status-indicator cell-gray";
            cell.appendChild(ind);
            cell.classList.add("future-day");
        } else {
            // Check past records
            const hasRecord = state.dailyLogs[dateStr] && Object.keys(state.dailyLogs[dateStr]).length > 0;
            const fracSpan = document.createElement("span");
            fracSpan.className = "calendar-day-fraction";

            const ind = document.createElement("div");
            ind.className = "day-status-indicator";

            if (hasRecord && stats.total > 0) {
                fracSpan.textContent = `${stats.completed}/${stats.total}`;
                
                if (stats.completed === stats.total) {
                    ind.classList.add("cell-green");
                } else if (stats.completed > 0) {
                    ind.classList.add("cell-yellow");
                } else {
                    ind.classList.add("cell-red");
                }
            } else {
                // No record found or template was empty -> "No Entry" = Red
                fracSpan.textContent = "No Entry";
                ind.classList.add("cell-red");
            }
            
            cell.appendChild(fracSpan);
            cell.appendChild(ind);
        }

        // Click handles retroactive checkins
        cell.onclick = () => {
            if (!isFuture) {
                openDateDetailsModal(dateStr);
            } else {
                showToast("You cannot retroactively log future checkpoints!", "info");
            }
        };

        grid.appendChild(cell);
    }
}

function navigatePreviousMonth() {
    calendarCurrentMonth--;
    if (calendarCurrentMonth < 0) {
        calendarCurrentMonth = 11;
        calendarCurrentYear--;
    }
    renderCalendarPage();
}

function navigateNextMonth() {
    calendarCurrentMonth++;
    if (calendarCurrentMonth > 11) {
        calendarCurrentMonth = 0;
        calendarCurrentYear++;
    }
    renderCalendarPage();
}

// Retroactive Date Details modal popup
function openDateDetailsModal(dateStr) {
    const title = document.getElementById("date-details-title");
    
    // Parse formatting: "July 31, 2026"
    const parsedDate = new Date(dateStr + "T00:00:00");
    const options = { month: 'long', day: 'numeric', year: 'numeric' };
    title.textContent = `Ledger: ${parsedDate.toLocaleDateString('en-US', options)}`;

    // Sync logs structure for that date
    syncDayLogs(dateStr);
    renderDateDetailsList(dateStr);
    
    openModal("modal-date-details");
}

function renderDateDetailsList(dateStr) {
    const list = document.getElementById("date-habits-list-container");
    list.innerHTML = "";

    const stats = getDayCompletionStats(dateStr);
    const completionPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    
    document.getElementById("date-details-percentage-txt").textContent = `${completionPercent}% Completed (${stats.completed} of ${stats.total})`;
    document.getElementById("date-details-progress-bar").style.width = `${completionPercent}%`;

    state.habits.forEach(habit => {
        const status = state.dailyLogs[dateStr][habit.id] || "pending";
        const row = createRetroactiveHabitRow(habit, status, dateStr);
        list.appendChild(row);
    });
}

function createRetroactiveHabitRow(habit, status, dateStr) {
    const row = document.createElement("div");
    row.className = `today-habit-row ${status}`;
    row.style.padding = "10px 16px";

    const left = document.createElement("div");
    left.className = "today-habit-left";

    const chk = document.createElement("div");
    chk.className = "checkbox-custom";
    chk.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>`;
    chk.onclick = () => toggleHabitCheck(habit.id, dateStr);

    const iconBox = document.createElement("div");
    iconBox.className = "today-habit-icon-box";
    iconBox.style.width = "30px";
    iconBox.style.height = "30px";
    iconBox.style.backgroundColor = habit.color;
    iconBox.innerHTML = getIconSvg(habit.icon);

    const nameSpan = document.createElement("span");
    nameSpan.className = "today-habit-name";
    nameSpan.style.fontSize = "14px";
    nameSpan.textContent = habit.name;

    left.appendChild(chk);
    left.appendChild(iconBox);
    left.appendChild(nameSpan);

    const right = document.createElement("div");
    right.className = "today-habit-right";
    
    if (status === "pending") {
        right.innerHTML = `
            <button class="btn-action-circle act-complete" title="Mark Complete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="btn-action-circle act-skip" title="Mark Skipped">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;
    } else {
        right.innerHTML = `
            <button class="btn-action-circle act-pending" title="Mark Pending">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
        `;
    }

    const completeBtn = right.querySelector(".act-complete");
    const skipBtn = right.querySelector(".act-skip");
    const pendingBtn = right.querySelector(".act-pending");

    if (completeBtn) completeBtn.onclick = () => updateHabitStatus(habit.id, "completed", dateStr);
    if (skipBtn) skipBtn.onclick = () => updateHabitStatus(habit.id, "skipped", dateStr);
    if (pendingBtn) pendingBtn.onclick = () => updateHabitStatus(habit.id, "pending", dateStr);

    row.appendChild(left);
    row.appendChild(right);

    return row;
}

// ==========================================================================
// 10. Reports Engine & Custom SVG Charts / Heatmaps Builder
// ==========================================================================

function renderReportsPage() {
    // 1. Calculate KPI Metrics
    const today = getTodayString();
    const todayStats = getDayCompletionStats(today);
    const todayPercent = todayStats.total > 0 ? Math.round((todayStats.completed / todayStats.total) * 100) : 0;
    
    document.getElementById("kpi-today-val").textContent = `${todayPercent}%`;
    document.getElementById("kpi-today-bar").style.width = `${todayPercent}%`;

    // Past 7 Days averages
    let weeklyAccum = 0;
    let weeklyDays = 0;
    for (let i = 0; i < 7; i++) {
        const dStr = getPastDateString(i);
        const stats = getDayCompletionStats(dStr);
        if (stats.total > 0) {
            weeklyAccum += (stats.completed / stats.total);
            weeklyDays++;
        }
    }
    const weeklyAvg = weeklyDays > 0 ? Math.round((weeklyAccum / weeklyDays) * 100) : 0;
    document.getElementById("kpi-weekly-val").textContent = `${weeklyAvg}%`;
    document.getElementById("kpi-weekly-bar").style.width = `${weeklyAvg}%`;

    // Past 30 Days Averages
    let monthlyAccum = 0;
    let monthlyDays = 0;
    for (let i = 0; i < 30; i++) {
        const dStr = getPastDateString(i);
        const stats = getDayCompletionStats(dStr);
        if (stats.total > 0) {
            monthlyAccum += (stats.completed / stats.total);
            monthlyDays++;
        }
    }
    const monthlyAvg = monthlyDays > 0 ? Math.round((monthlyAccum / monthlyDays) * 100) : 0;
    document.getElementById("kpi-monthly-val").textContent = `${monthlyAvg}%`;
    document.getElementById("kpi-monthly-bar").style.width = `${monthlyAvg}%`;

    // Overall Average
    let overallAccum = 0;
    let overallDays = 0;
    Object.keys(state.dailyLogs).forEach(date => {
        const stats = getDayCompletionStats(date);
        if (stats.total > 0) {
            overallAccum += (stats.completed / stats.total);
            overallDays++;
        }
    });
    const overallAvg = overallDays > 0 ? Math.round((overallAccum / overallDays) * 100) : 0;
    document.getElementById("kpi-overall-val").textContent = `${overallAvg}%`;
    document.getElementById("kpi-overall-bar").style.width = `${overallAvg}%`;

    // Stats Overview Section
    document.getElementById("stats-total-days").textContent = overallDays;
    document.getElementById("stats-yearly-avg").textContent = `${overallAvg}%`; // seeded year

    // Best / Worst Day Calculations
    let bestDay = "N/A";
    let bestPercent = -1;
    let worstDay = "N/A";
    let worstPercent = 101;

    Object.keys(state.dailyLogs).forEach(date => {
        const stats = getDayCompletionStats(date);
        if (stats.total > 0) {
            const pct = Math.round((stats.completed / stats.total) * 100);
            if (pct > bestPercent) {
                bestPercent = pct;
                bestDay = date;
            }
            if (pct < worstPercent) {
                worstPercent = pct;
                worstDay = date;
            }
        }
    });

    if (bestPercent >= 0) {
        document.getElementById("stats-best-day").textContent = `${formatShortDate(bestDay)} (${bestPercent}%)`;
    }
    if (worstPercent <= 100) {
        document.getElementById("stats-worst-day").textContent = `${formatShortDate(worstDay)} (${worstPercent}%)`;
    }

    // 2. Render Custom SVG Visual Charts
    renderLineChart();
    renderBarChart();
    renderPieChart();
    renderCalendarHeatmap();
}

// Dynamic elements generator namespace
function createSVGNode(tag, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs).forEach(key => el.setAttribute(key, attrs[key]));
    return el;
}

// PAST 7 DAYS trend SVG line chart
function renderLineChart() {
    const container = document.getElementById("line-chart-container");
    container.innerHTML = "";

    // Dimensions
    const width = container.clientWidth || 500;
    const height = 220;
    const padding = 32;

    const svg = createSVGNode("svg", {
        width: "100%",
        height: height,
        viewBox: `0 0 ${width} ${height}`
    });

    // Gradients definition for beautiful area shading
    const defs = createSVGNode("defs");
    const grad = createSVGNode("linearGradient", {
        id: "chart-gradient",
        x1: "0", y1: "0", x2: "0", y2: "1"
    });
    grad.appendChild(createSVGNode("stop", { offset: "0%", "stop-color": "var(--accent-primary)", "stop-opacity": "0.4" }));
    grad.appendChild(createSVGNode("stop", { offset: "100%", "stop-color": "var(--accent-primary)", "stop-opacity": "0" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Calculate last 7 days records
    const dataset = [];
    for (let i = 6; i >= 0; i--) {
        const dStr = getPastDateString(i);
        const stats = getDayCompletionStats(dStr);
        const pct = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
        dataset.push({ label: formatDayLabel(dStr), value: pct });
    }

    // Grid lines & labels (0%, 25%, 50%, 75%, 100%)
    const yGridValues = [0, 25, 50, 75, 100];
    yGridValues.forEach(val => {
        const y = padding + (100 - val) / 100 * (height - 2 * padding);
        
        // Grid Line
        svg.appendChild(createSVGNode("line", {
            x1: padding,
            y1: y,
            x2: width - padding,
            y2: y,
            class: "chart-grid-line"
        }));

        // Label
        const txt = createSVGNode("text", {
            x: padding - 8,
            y: y + 4,
            class: "chart-label-text",
            "text-anchor": "end"
        });
        txt.textContent = `${val}%`;
        svg.appendChild(txt);
    });

    // Draw lines paths coordinates
    const chartW = width - 2 * padding;
    const chartH = height - 2 * padding;
    const stepX = chartW / (dataset.length - 1);

    let pathPoints = "";
    let areaPoints = `L ${padding + chartW} ${padding + chartH} L ${padding} ${padding + chartH} Z`;

    dataset.forEach((data, index) => {
        const x = padding + index * stepX;
        const y = padding + (100 - data.value) / 100 * chartH;
        
        if (index === 0) {
            pathPoints += `M ${x} ${y}`;
            areaPoints = `M ${x} ${y} ` + areaPoints;
        } else {
            pathPoints += ` L ${x} ${y}`;
            areaPoints = areaPoints.replace(" Z", ` L ${x} ${y} L ${padding + chartW} ${padding + chartH} L ${padding} ${padding + chartH} Z`);
        }

        // Draw Interactive dot markers
        const circle = createSVGNode("circle", {
            cx: x,
            cy: y,
            r: 5,
            fill: "var(--accent-primary)",
            stroke: "var(--bg-app)",
            "stroke-width": 2,
            style: "cursor: pointer; transition: r 0.2s;"
        });
        
        // Custom interactive charts tooltip
        circle.addEventListener("mouseenter", (e) => {
            circle.setAttribute("r", "7");
            showChartTooltip(container, e.clientX, e.clientY, `${data.label}: ${Math.round(data.value)}%`);
        });
        circle.addEventListener("mouseleave", () => {
            circle.setAttribute("r", "5");
            hideChartTooltip(container);
        });

        svg.appendChild(circle);

        // Draw Day name strings below grid
        const labelText = createSVGNode("text", {
            x: x,
            y: height - 10,
            class: "chart-label-text",
            "text-anchor": "middle"
        });
        labelText.textContent = data.label;
        svg.appendChild(labelText);
    });

    // Inject paths
    const linePath = createSVGNode("path", {
        d: pathPoints,
        class: "chart-trend-path"
    });
    
    const areaPath = createSVGNode("path", {
        d: areaPoints,
        class: "chart-trend-area"
    });

    svg.insertBefore(areaPath, svg.firstChild); // Keep area path behind dots
    svg.insertBefore(linePath, svg.firstChild);

    container.appendChild(svg);
}

// Category Bar chart averages SVG
function renderBarChart() {
    const container = document.getElementById("bar-chart-container");
    container.innerHTML = "";

    const width = container.clientWidth || 350;
    const height = 220;
    const padding = 36;

    const svg = createSVGNode("svg", {
        width: "100%",
        height: height,
        viewBox: `0 0 ${width} ${height}`
    });

    // Categories names mapping
    const categories = ["Health", "Fitness", "Mind", "Work", "Routine", "Custom"];
    const dataset = categories.map(cat => {
        // Average completion rate of habits in this category
        const catHabits = state.habits.filter(h => h.category === cat);
        let accum = 0;
        let loggedDays = 0;
        
        catHabits.forEach(h => {
            Object.keys(state.dailyLogs).forEach(date => {
                const log = state.dailyLogs[date][h.id];
                if (log === "completed" || log === "pending" || log === "skipped") {
                    loggedDays++;
                    if (log === "completed") accum++;
                }
            });
        });

        const rate = loggedDays > 0 ? (accum / loggedDays) * 100 : 0;
        return { label: cat, value: rate };
    });

    const chartW = width - 2 * padding;
    const chartH = height - 2 * padding;
    const barStep = chartW / dataset.length;
    const barW = barStep * 0.6;

    // Y Axis labels
    const yGridValues = [0, 50, 100];
    yGridValues.forEach(val => {
        const y = padding + (100 - val) / 100 * chartH;
        svg.appendChild(createSVGNode("line", {
            x1: padding,
            y1: y,
            x2: width - padding,
            y2: y,
            class: "chart-grid-line"
        }));

        const txt = createSVGNode("text", {
            x: padding - 8,
            y: y + 4,
            class: "chart-label-text",
            "text-anchor": "end"
        });
        txt.textContent = `${val}%`;
        svg.appendChild(txt);
    });

    dataset.forEach((data, index) => {
        const x = padding + index * barStep + (barStep - barW) / 2;
        const barH = (data.value / 100) * chartH;
        const y = padding + chartH - barH;

        // Custom Bar
        const bar = createSVGNode("rect", {
            x: x,
            y: y,
            width: barW,
            height: barH,
            class: "chart-bar-rect",
            "data-value": data.value
        });

        // Hover tooltip
        bar.addEventListener("mouseenter", (e) => {
            showChartTooltip(container, e.clientX, e.clientY, `${data.label}: ${Math.round(data.value)}%`);
        });
        bar.addEventListener("mouseleave", () => {
            hideChartTooltip(container);
        });

        svg.appendChild(bar);

        // Labels
        const lbl = createSVGNode("text", {
            x: x + barW / 2,
            y: height - 12,
            class: "chart-label-text",
            "text-anchor": "middle"
        });
        lbl.textContent = data.label.substring(0, 4); // Trim string
        svg.appendChild(lbl);
    });

    container.appendChild(svg);
}

// Priority breakdown SVG pie chart
function renderPieChart() {
    const container = document.getElementById("pie-chart-container");
    container.innerHTML = "";

    const width = 240;
    const height = 240;
    const radius = 90;
    const cx = width / 2;
    const cy = height / 2;

    const svg = createSVGNode("svg", {
        width: width,
        height: height,
        viewBox: `0 0 ${width} ${height}`
    });

    // Counts habits per priorities
    const priorities = ["High", "Medium", "Low"];
    const colors = { High: "#f43f5e", Medium: "#f59e0b", Low: "#06b6d4" };
    
    let totalHabits = state.habits.length;
    if (totalHabits === 0) {
        container.innerHTML = "<p class='text-muted'>No data logged</p>";
        return;
    }

    const dataset = priorities.map(pri => {
        const count = state.habits.filter(h => h.priority === pri).length;
        return { label: pri, value: count, color: colors[pri] };
    }).filter(d => d.value > 0);

    let accumulatedAngle = 0;

    dataset.forEach(data => {
        const angle = (data.value / totalHabits) * 360;
        
        // Calculate SVG Pie paths arcs
        const x1 = cx + radius * Math.cos((accumulatedAngle - 90) * Math.PI / 180);
        const y1 = cy + radius * Math.sin((accumulatedAngle - 90) * Math.PI / 180);
        
        const x2 = cx + radius * Math.cos((accumulatedAngle + angle - 90) * Math.PI / 180);
        const y2 = cy + radius * Math.sin((accumulatedAngle + angle - 90) * Math.PI / 180);

        const largeArc = angle > 180 ? 1 : 0;
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        const slice = createSVGNode("path", {
            d: d,
            fill: data.color,
            class: "chart-pie-slice"
        });

        // Hover tooltip
        slice.addEventListener("mouseenter", (e) => {
            const pct = Math.round((data.value / totalHabits) * 100);
            showChartTooltip(container, e.clientX, e.clientY, `${data.label} Priority: ${data.value} habit(s) (${pct}%)`);
        });
        slice.addEventListener("mouseleave", () => {
            hideChartTooltip(container);
        });

        svg.appendChild(slice);

        // Labels values in center of slice
        const textAngle = accumulatedAngle + angle / 2 - 90;
        const tx = cx + (radius * 0.6) * Math.cos(textAngle * Math.PI / 180);
        const ty = cy + (radius * 0.6) * Math.sin(textAngle * Math.PI / 180) + 4;
        
        const txt = createSVGNode("text", {
            x: tx,
            y: ty,
            class: "chart-pie-text"
        });
        txt.textContent = `${Math.round((data.value / totalHabits) * 100)}%`;
        svg.appendChild(txt);

        accumulatedAngle += angle;
    });

    container.appendChild(svg);
}

// GitHub 53-week consistency heatmap renderer SVG
function renderCalendarHeatmap() {
    const container = document.getElementById("heatmap-container");
    container.innerHTML = "";

    // We will draw cells for the current year
    const year = new Date().getFullYear();
    const startDate = new Date(year, 0, 1);
    const startDayIndex = startDate.getDay(); // 0 is Sunday, 6 is Saturday
    
    // We adjust starting points to match rows
    const cellW = 12;
    const spacing = 3;
    const padding = 20;

    const width = 53 * (cellW + spacing) + padding * 2;
    const height = 7 * (cellW + spacing) + padding * 2;

    const svg = createSVGNode("svg", {
        width: width,
        height: height,
        viewBox: `0 0 ${width} ${height}`
    });

    // Seed/calculate active year days logs
    let currentX = padding;
    let currentY = padding + startDayIndex * (cellW + spacing);

    // Loop through 365 days of year
    const msInDay = 24 * 60 * 60 * 1000;
    const totalDays = isLeapYear(year) ? 366 : 365;

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
        const currentDate = new Date(startDate.getTime() + dayOffset * msInDay);
        const dateStr = currentDate.toISOString().split('T')[0];

        const stats = getDayCompletionStats(dateStr);
        const completionRate = stats.total > 0 ? (stats.completed / stats.total) : 0;

        // Choose color density mapping based on rates
        let color = "var(--state-gray)"; // 0%
        if (stats.total > 0) {
            if (completionRate === 1) color = "var(--state-success)"; // 100%
            else if (completionRate >= 0.6) color = "rgba(var(--state-success-rgb), 0.75)";
            else if (completionRate >= 0.3) color = "rgba(var(--state-success-rgb), 0.45)";
            else if (completionRate > 0) color = "rgba(var(--state-success-rgb), 0.2)";
            else color = "var(--state-danger)"; // Checked in but nothing done
        }

        const rect = createSVGNode("rect", {
            x: currentX,
            y: currentY,
            width: cellW,
            height: cellW,
            fill: color,
            class: "heatmap-rect"
        });

        // Hover alerts
        rect.addEventListener("mouseenter", (e) => {
            const formatted = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const completionMsg = stats.total > 0 ? `${stats.completed}/${stats.total} habits completed` : "No habits tracked";
            showChartTooltip(container, e.clientX, e.clientY, `${formatted}: ${completionMsg}`);
        });
        
        rect.addEventListener("mouseleave", () => {
            hideChartTooltip(container);
        });

        svg.appendChild(rect);

        // Advance layout coordinate parameters
        currentY += cellW + spacing;
        if (currentDate.getDay() === 6) {
            currentY = padding; // Wrap back to Sunday row
            currentX += cellW + spacing; // Next week column
        }
    }

    container.appendChild(svg);
}

// Chart tooltips controls
function showChartTooltip(container, clientX, clientY, text) {
    let tooltip = container.querySelector(".chart-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.className = "chart-tooltip";
        container.appendChild(tooltip);
    }
    tooltip.innerHTML = text;
    
    // Bounds check
    const bounds = container.getBoundingClientRect();
    const x = clientX - bounds.left + 15;
    const y = clientY - bounds.top - 15;

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.opacity = "1";
}

function hideChartTooltip(container) {
    const tooltip = container.querySelector(".chart-tooltip");
    if (tooltip) {
        tooltip.style.opacity = "0";
    }
}

// Calculations utility helper methods
function getDayCompletionStats(dateStr) {
    const logs = state.dailyLogs[dateStr] || {};
    
    // Habits created *on or before* this date should be counted
    const dateObj = new Date(dateStr + "T23:59:59");
    const activeHabits = state.habits.filter(h => new Date(h.createdAt) <= dateObj);

    let total = activeHabits.length;
    let completed = 0;
    let pending = 0;
    let skipped = 0;

    activeHabits.forEach(h => {
        const log = logs[h.id] || "pending";
        if (log === "completed") completed++;
        else if (log === "skipped") skipped++;
        else pending++;
    });

    return { total, completed, pending, skipped };
}

function calculateStreaks() {
    let current = 0;
    let longest = 0;
    let perfectDays = 0;
    let activeStreak = true;

    // Traverse dates backwards starting from today
    let daysAgo = 0;
    const maxHistoricalCheck = 365;

    // First find longest streak across entire logs histories
    let tempStreak = 0;
    
    // Sort all dates in dailyLogs chronologically
    const loggedDates = Object.keys(state.dailyLogs).sort();
    
    loggedDates.forEach(date => {
        const stats = getDayCompletionStats(date);
        if (stats.total > 0 && stats.completed === stats.total) {
            tempStreak++;
            perfectDays++;
            if (tempStreak > longest) {
                longest = tempStreak;
            }
        } else {
            tempStreak = 0;
        }
    });

    // Calculate current active streak backwards from today
    const todayStr = getTodayString();
    const todayStats = getDayCompletionStats(todayStr);

    // If today is complete or partial, we evaluate start point
    let startDayOffset = 0;
    if (todayStats.total > 0 && todayStats.completed === todayStats.total) {
        current = 1;
        startDayOffset = 1;
    } else {
        // Today is incomplete, current streak starts from yesterday if yesterday is perfect
        startDayOffset = 1;
    }

    for (let i = startDayOffset; i < maxHistoricalCheck; i++) {
        const dStr = getPastDateString(i);
        const stats = getDayCompletionStats(dStr);

        // If no habits existed, skip day without breaking streak
        if (stats.total === 0) continue;

        if (stats.completed === stats.total) {
            current++;
        } else {
            break; // Streak broken
        }
    }

    // Edge case if longest is smaller than current
    if (current > longest) longest = current;

    return { current, longest, perfectDays };
}

// Leap years checker helper
function isLeapYear(year) {
    return ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
}

// ==========================================================================
// 11. System Settings & Configuration Controllers
// ==========================================================================

function renderSettingsPage() {
    // Sync buttons visually to state values
    const dBtn = document.getElementById("btn-theme-dark");
    const lBtn = document.getElementById("btn-theme-light");

    if (state.settings.theme === "dark") {
        dBtn.classList.add("active");
        lBtn.classList.remove("active");
    } else {
        lBtn.classList.add("active");
        dBtn.classList.remove("active");
    }

    // Set accent picker dot active
    document.querySelectorAll(".accent-circle").forEach(c => {
        if (c.getAttribute("data-color") === state.settings.accentColor) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });

    // Hook listeners
    dBtn.onclick = () => {
        state.settings.theme = "dark";
        saveStateToStorage();
        applyVisualSettings();
        renderSettingsPage();
        showToast("Dark mode activated!", "info");
    };

    lBtn.onclick = () => {
        state.settings.theme = "light";
        saveStateToStorage();
        applyVisualSettings();
        renderSettingsPage();
        showToast("Light mode activated!", "info");
    };

    // Accents circles listeners hook
    document.querySelectorAll(".accent-circle").forEach(circle => {
        circle.onclick = () => {
            const color = circle.getAttribute("data-color");
            state.settings.accentColor = color;
            saveStateToStorage();
            applyVisualSettings();
            renderSettingsPage();
            showToast(`Accent color updated to ${color}!`, "success");
        };
    });

    // Backups triggers
    document.getElementById("btn-export-data").onclick = exportDataJSON;
    document.getElementById("btn-trigger-import").onclick = () => document.getElementById("import-data-file").click();
    document.getElementById("import-data-file").onchange = handleDataImport;

    // Reset database
    document.getElementById("btn-reset-data").onclick = triggerSystemReset;
}

function applyVisualSettings() {
    const html = document.documentElement;
    html.setAttribute("data-theme", state.settings.theme);
    html.setAttribute("data-accent", state.settings.accentColor);
}

function exportDataJSON() {
    const backup = {
        habits: state.habits,
        dailyLogs: state.dailyLogs,
        settings: state.settings,
        version: "1.0"
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `aura_habit_backup_${getTodayString()}.json`);
    dlAnchorElem.click();
    showToast("Ledger backups downloaded!", "success");
}

function handleDataImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const parsed = JSON.parse(evt.target.result);
            if (parsed.habits && parsed.dailyLogs) {
                state.habits = parsed.habits;
                state.dailyLogs = parsed.dailyLogs;
                if (parsed.settings) state.settings = parsed.settings;
                
                saveStateToStorage();
                applyVisualSettings();
                showToast("Ledger backup restored successfully!", "success");
                refreshAllViews();
            } else {
                showToast("Malformed backup file, missing critical nodes.", "error");
            }
        } catch (err) {
            showToast("Failed to parse JSON backup files.", "error");
        }
    };
    reader.readAsText(file);
}

function triggerSystemReset() {
    showConfirmDialog(
        "Reset System Ledger Database?",
        "Are you sure you want to restore Aura to its initial states? All custom habit checklists templates and completed streaks parameters will be permanently cleared from Local Storage. This cannot be undone.",
        () => {
            localStorage.clear();
            state.habits = [...DEFAULT_HABITS];
            state.dailyLogs = generateSeedLogs();
            state.settings = { theme: "dark", accentColor: "blue" };
            saveStateToStorage();
            applyVisualSettings();
            showToast("Aura system restored to default templates.", "info");
            navigatePage("dashboard");
        }
    );
}

// ==========================================================================
// 12. Particles Confetti Celebration System
// ==========================================================================

let confettiActive = false;
let confettiParticles = [];
const confettiCanvas = document.getElementById("confetti-canvas");
const confettiCtx = confettiCanvas ? confettiCanvas.getContext("2d") : null;

function resizeConfettiCanvas() {
    if (confettiCanvas) {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }
}
window.addEventListener("resize", resizeConfettiCanvas);

function triggerConfetti() {
    resizeConfettiCanvas();
    confettiParticles = [];
    const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f43f5e", "#f59e0b", "#06b6d4"];
    
    // Spawn 120 particles
    for (let i = 0; i < 120; i++) {
        confettiParticles.push({
            x: window.innerWidth / 2,
            y: window.innerHeight + 10,
            angle: (Math.random() * 90 + 45) * Math.PI / 180, // Launch up-ward angle
            speed: Math.random() * 12 + 10,
            radius: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 4 - 2,
            opacity: 1,
            gravity: 0.35,
            drag: 0.96
        });
    }

    if (!confettiActive) {
        confettiActive = true;
        animateConfetti();
    }
}

function animateConfetti() {
    if (!confettiCtx || confettiParticles.length === 0) {
        confettiActive = false;
        if (confettiCtx) confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
        return;
    }

    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    confettiParticles.forEach((p, index) => {
        // Apply physics
        p.speed *= p.drag;
        p.x += Math.cos(p.angle) * p.speed;
        p.y -= Math.sin(p.angle) * p.speed - p.gravity;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.015;

        // Draw rotated particle square
        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate(p.rotation * Math.PI / 180);
        confettiCtx.fillStyle = p.color;
        confettiCtx.globalAlpha = p.opacity;
        confettiCtx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
        confettiCtx.restore();

        // Kill decayed particles
        if (p.y > window.innerHeight + 20 || p.opacity <= 0) {
            confettiParticles.splice(index, 1);
        }
    });

    if (confettiActive) {
        requestAnimationFrame(animateConfetti);
    }
}

// ==========================================================================
// 13. System Utilities & Helper Helpers
// ==========================================================================

// Sorting algorithm
function sortHabits(habitsList, criteria, dateStr = null) {
    const listCopy = [...habitsList];
    
    switch (criteria) {
        case "newest":
            return listCopy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        case "oldest":
            return listCopy.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        case "alphabetical":
            return listCopy.sort((a, b) => a.name.localeCompare(b.name));
        case "priority":
            const pWeights = { High: 3, Medium: 2, Low: 1 };
            return listCopy.sort((a, b) => pWeights[b.priority] - pWeights[a.priority]);
        case "time":
            return listCopy.sort((a, b) => a.time.localeCompare(b.time));
        case "completion":
            if (!dateStr) return listCopy;
            return listCopy.sort((a, b) => {
                const statusA = state.dailyLogs[dateStr]?.[a.id] === "completed" ? 1 : 0;
                const statusB = state.dailyLogs[dateStr]?.[b.id] === "completed" ? 1 : 0;
                return statusA - statusB; // Completed values fall to bottom
            });
        default:
            return listCopy;
    }
}

// Inline SVGs Map
function getIconSvg(iconId) {
    const icons = {
        heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
        dumbbell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6.5 6.5h11M6.5 17.5h11M12 2v20M3 10h18M3 14h18"/></svg>`,
        brain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-3.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-3.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2z"/></svg>`,
        briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
        book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5v-15z"/></svg>`,
        coffee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`
    };
    return icons[iconId] || icons.heart;
}

// DateTime formats
function formatTime(timeStr) {
    if (!timeStr) return "";
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // Hour '0' -> '12'
    return `${hours}:${minutes} ${ampm}`;
}

function formatShortDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayLabel(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return weekdays[d.getDay()];
}

// Keyboard shortcuts mappings
function registerKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
        // Disable shortcuts if active writing fields are focused
        const activeNode = document.activeElement;
        if (activeNode && (activeNode.tagName === 'INPUT' || activeNode.tagName === 'SELECT' || activeNode.tagName === 'TEXTAREA')) {
            // Esc will close modals even if fields are active
            if (e.key === "Escape") {
                closeAllActiveModals();
            }
            return;
        }

        switch (e.key.toLowerCase()) {
            case "d":
                navigatePage("dashboard");
                break;
            case "h":
                navigatePage("habits");
                break;
            case "c":
                navigatePage("calendar");
                break;
            case "r":
                navigatePage("reports");
                break;
            case "s":
                navigatePage("settings");
                break;
            case "n":
                openHabitFormModal();
                break;
            case "?":
                openModal("modal-shortcuts");
                break;
            case "escape":
                closeAllActiveModals();
                break;
        }
    });
}

function closeAllActiveModals() {
    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.classList.remove("active");
    });
}
