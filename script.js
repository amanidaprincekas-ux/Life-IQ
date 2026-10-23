/*
 * Life IQ persistence contract:
 * - Keep STORAGE_KEY unchanged between deployments.
 * - Increase DATA_VERSION and add an explicit migration when changing saved data.
 * - Never seed defaults over a saved record that cannot be read.
 */
const startScreen = document.getElementById("start-screen");
const STORAGE_KEY = "life-game-progression-v1";
const DATA_VERSION = 3;
let storageStatus = "ready";
let progression = loadProgression();
let showArchivedItems = false;

const QUESTION_POOL = [
    { id: "avoiding", text: "What are you avoiding right now?" },
    { id: "honesty", text: "Is there anything you want to be more honest with yourself about?" },
    { id: "attention", text: "What has been receiving most of your attention lately?" },
    { id: "postponed-good", text: "What is something good you keep postponing?" },
    { id: "busy-progress", text: "Does your recent activity feel like progress, or more like staying busy?" },
    { id: "rest-context", text: "Would rest help you here, or might something else be asking for attention?" },
    { id: "small-change", text: "What small change would make the next step more honest?" },
    { id: "values-choice", text: "Did a recent choice line up with what you said matters to you?" },
    { id: "learned", text: "What have you learned about yourself from the last few days?" },
    { id: "repair", text: "Is there anything here that might call for a repair, a boundary, or a conversation?" },
    { id: "good-notice", text: "What is something good you have noticed but not paused to appreciate?" },
    { id: "release", text: "What are you ready to stop carrying in the same way?" }
];

function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(dateText, days) {
    const [year, month, day] = dateText.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function localDateTime(value) {
    if (!value) return "Date not available (recorded before dated history)";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date not available" : date.toLocaleString();
}
function defaultQuestioner() {
    const min = 3, max = 7;
    return { randomEnabled: true, minDays: min, maxDays: max, nextRandomOn: addDays(dateKey(), randomInt(min, max)), snoozedUntil: null, pending: null, history: [] };
}
function freshProgression() {
    const data = {
        schemaVersion: DATA_VERSION,
        startedOn: dateKey(),
        updatedAt: new Date().toISOString(),
        profile: { description: "", chosenStats: [], setupComplete: false },
        categories: [
            { name: "Health", subcategories: [{ name: "Basketball", actions: [{ name: "Play basketball", xp: 5 }, { name: "Work on conditioning or jumping", xp: 20 }] }, { name: "Strength Training", actions: [] }] },
            { name: "Spirituality", subcategories: [{ name: "Faith", actions: [{ name: "Return to God when I don't feel like it", xp: 15 }] }, { name: "Fasting", actions: [] }, { name: "Obedience", actions: [] }] },
            { name: "Live S2S", subcategories: [{ name: "Project development", actions: [] }, { name: "Testing ideas", actions: [] }, { name: "Completing and shipping features", actions: [] }] },
            { name: "Wisdom", subcategories: [] }
        ],
        leveling: { firstLevelXP: 100, stepXP: 50 },
        events: [],
        questioner: defaultQuestioner()
    };
    data.categories.forEach(category => {
        category.id = makeId();
        category.subcategories.forEach(subcategory => {
            subcategory.id = makeId();
            subcategory.actions.forEach(action => { action.id = makeId(); action.awards = []; });
        });
    });
    return data;
}

function normalizeProgression(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.categories)) throw new Error("Saved data has no category list.");
    const oldVersion = Number(data.schemaVersion || 1);
    data.profile = data.profile && typeof data.profile === "object" ? data.profile : {};
    data.profile.description = String(data.profile.description || "");
    data.profile.chosenStats = Array.isArray(data.profile.chosenStats) ? data.profile.chosenStats.map(String) : [];
    data.profile.setupComplete = Boolean(data.profile.setupComplete);
    data.startedOn = /^\d{4}-\d{2}-\d{2}$/.test(data.startedOn || "") ? data.startedOn : dateKey();
    data.leveling = data.leveling || { firstLevelXP: 100, stepXP: 50 };
    data.leveling.firstLevelXP = Math.max(1, Number(data.leveling.firstLevelXP) || 100);
    data.leveling.stepXP = Math.max(0, Number(data.leveling.stepXP) || 0);
    if (!Array.isArray(data.events)) data.events = [];
    data.categories.forEach(category => {
        category.id ||= makeId();
        category.name = String(category.name || "Untitled category");
        category.archivedAt ||= null;
        if (!Array.isArray(category.subcategories)) category.subcategories = [];
        category.subcategories.forEach(subcategory => {
            subcategory.id ||= makeId();
            subcategory.name = String(subcategory.name || "Untitled subcategory");
            subcategory.archivedAt ||= null;
            if (!Array.isArray(subcategory.actions)) subcategory.actions = [];
            subcategory.actions.forEach(action => {
                action.id ||= makeId();
                action.name = String(action.name || "Untitled action");
                action.xp = Math.max(0, Number(action.xp) || 0);
                action.archivedAt ||= null;
                action.awards = (Array.isArray(action.awards) ? action.awards : []).map(award => {
                    if (typeof award === "number") return { xp: Math.max(0, award), earnedAt: null, legacy: true };
                    if (award && Number.isFinite(Number(award.xp))) return { xp: Math.max(0, Number(award.xp)), earnedAt: award.earnedAt || null, legacy: Boolean(award.legacy) };
                    return null;
                }).filter(Boolean);
            });
        });
    });
    // Preserve the old default category and all of its contents/progress under the new name.
    const oldDefault = data.categories.find(category => category.name === "Time & Responsibilities");
    const wisdomDefault = data.categories.find(category => category.name === "Wisdom");
    if (oldDefault && wisdomDefault && oldDefault.id !== wisdomDefault.id) {
        wisdomDefault.subcategories.push(...oldDefault.subcategories);
        data.events.forEach(record => {
            if (record.categoryId === oldDefault.id) { record.categoryId = wisdomDefault.id; record.categoryName = wisdomDefault.name; }
        });
        data.categories = data.categories.filter(category => category.id !== oldDefault.id);
    } else if (oldDefault && !wisdomDefault) oldDefault.name = "Wisdom";
    // Older versions stored XP awards but no activity timeline. Keep every award as a
    // legacy history record without inventing a completion date.
    if (oldVersion < DATA_VERSION && data.events.length === 0) {
        data.categories.forEach(category => category.subcategories.forEach(subcategory => subcategory.actions.forEach(action => {
            action.awards.forEach(award => data.events.push({
                id: makeId(), type: "completion", impact: "positive", title: action.name,
                details: "Saved XP record. The earlier version did not store its completion date.",
                categoryId: category.id, categoryName: category.name, subcategoryId: subcategory.id,
                subcategoryName: subcategory.name, actionId: action.id, actionName: action.name,
                xpAwarded: award.xp, createdAt: award.earnedAt || null, legacy: true
            }));
        })));
    }
    data.events = data.events.filter(event => event && typeof event === "object").map(event => ({
        ...event, id: event.id || makeId(), createdAt: event.createdAt || null,
        type: String(event.type || "reflection"), title: String(event.title || "Untitled record"),
        details: String(event.details || ""), impact: String(event.impact || event.type || "reflection")
    }));
    data.questioner = data.questioner && typeof data.questioner === "object" ? data.questioner : defaultQuestioner();
    const questioner = data.questioner;
    questioner.randomEnabled = questioner.randomEnabled !== false;
    questioner.minDays = Math.max(1, Number(questioner.minDays) || 3);
    questioner.maxDays = Math.max(questioner.minDays, Number(questioner.maxDays) || 7);
    questioner.history = Array.isArray(questioner.history) ? questioner.history : [];
    questioner.pending ||= null;
    questioner.snoozedUntil ||= null;
    questioner.nextRandomOn ||= addDays(dateKey(), randomInt(questioner.minDays, questioner.maxDays));
    data.schemaVersion = DATA_VERSION;
    data.updatedAt ||= new Date().toISOString();
    return data;
}

function loadProgression() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch (error) { storageStatus = "unavailable"; return freshProgression(); }
    if (raw === null) {
        const initial = freshProgression();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(initial)); }
        catch (error) { storageStatus = "unavailable"; }
        return initial;
    }
    try {
        const saved = JSON.parse(raw);
        const migrated = normalizeProgression(saved);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
        catch (error) { storageStatus = "unavailable"; }
        return migrated;
    } catch (error) {
        console.error("Life IQ saved data could not be read. It has not been overwritten.", error);
        storageStatus = "corrupt";
        return freshProgression();
    }
}
function saveProgression() {
    if (storageStatus !== "ready") return false;
    progression.schemaVersion = DATA_VERSION;
    progression.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progression)); return true; }
    catch (error) { storageStatus = "unavailable"; return false; }
}
function storageNotice() {
    if (storageStatus === "unavailable") return `<div class="storage-notice" role="alert"><strong>Browser saving is unavailable.</strong> Changes may not survive a refresh. Your existing saved record has not been replaced. Try a different browser setting and export a backup when storage works.</div>`;
    if (storageStatus === "corrupt") return `<div class="storage-notice" role="alert"><strong>Saved data could not be read.</strong> Life IQ has not overwritten it. Export/import a known backup or keep this page open while resolving the browser storage issue.</div>`;
    return "";
}
function setScreen(content) {
    startScreen.innerHTML = `${storageNotice()}${content}`;
}
function persistAndShow(view = "progression") {
    saveProgression();
    if (view === "world") showWorld();
    else if (view === "history") showHistory();
    else if (view === "questioner") showQuestioner();
    else if (view === "settings") showSettings();
    else showProgression();
}

function allAwards(actions) { return actions.reduce((sum, action) => sum + action.awards.reduce((value, award) => value + (Number(award.xp) || 0), 0), 0); }
function categoryXP(category) { return category.subcategories.reduce((sum, subcategory) => sum + allAwards(subcategory.actions), 0); }
function totalXP() { return progression.categories.reduce((sum, category) => sum + categoryXP(category), 0); }
function todayXP() {
    const today = dateKey();
    return progression.categories.reduce((sum, category) => sum + category.subcategories.reduce((subSum, subcategory) => subSum + subcategory.actions.reduce((actionSum, action) => actionSum + action.awards.reduce((awardSum, award) => {
        if (!award.earnedAt || Number.isNaN(new Date(award.earnedAt).getTime())) return awardSum;
        return dateKey(new Date(award.earnedAt)) === today ? awardSum + (Number(award.xp) || 0) : awardSum;
    }, 0), 0), 0), 0);
}
function dayNumber() {
    const [sy, sm, sd] = progression.startedOn.split("-").map(Number);
    const [ty, tm, td] = dateKey().split("-").map(Number);
    return Math.max(1, Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1);
}
function levelInfo(xp) {
    const first = progression.leveling.firstLevelXP, step = progression.leveling.stepXP;
    let level = 1, floor = 0, next = first;
    while (xp >= next && level < 100000) { floor = next; level++; next += step; if (step === 0) next = floor + first; }
    return { level, floor, next, progress: next > floor ? Math.min(100, ((xp - floor) / (next - floor)) * 100) : 100 };
}
function formatXP(value) { return `${Math.round(value * 100) / 100} XP`; }
function allActions() {
    return progression.categories.flatMap(category => category.subcategories.flatMap(subcategory => subcategory.actions.map(action => ({ category, subcategory, action }))));
}
function findCategory(id) { return progression.categories.find(category => category.id === id); }
function findSubcategory(categoryId, subcategoryId) { return findCategory(categoryId)?.subcategories.find(subcategory => subcategory.id === subcategoryId); }
function findAction(categoryId, subcategoryId, actionId) { return findSubcategory(categoryId, subcategoryId)?.actions.find(action => action.id === actionId); }
function moveWithin(array, id, direction) {
    const from = array.findIndex(item => item.id === id), to = from + direction;
    if (from < 0 || to < 0 || to >= array.length) return false;
    [array[from], array[to]] = [array[to], array[from]];
    return true;
}

function showWelcome() {
    setScreen(`<p class="small-text">DAY ${dayNumber()}</p><h1>LIFE IQ</h1><p class="subtitle">Your decisions are the game.</p><button id="start-button">ENTER</button>`);
}
function showCharacterCreation() {
    setScreen(`<p class="small-text">CHARACTER CREATION</p><h2>WHO DO YOU WANT TO BECOME?</h2><p class="subtitle">This is not a test.<br>There is no right answer.</p><textarea id="character-input" placeholder="Describe the person you want to become...">${esc(progression.profile.description)}</textarea><br><br><button id="continue-button">CONTINUE</button><button class="quiet-button" data-action="back-world">BACK</button>`);
}
function showMirror() {
    setScreen(`<p class="small-text">THE MIRROR</p><h2>ARE YOU WALKING IN TRUTH?</h2><p class="subtitle">You said you want to become:</p><div class="character-statement">“${esc(progression.profile.description)}”</div><p class="subtitle">Do you genuinely believe that?</p><div class="choice-container"><button class="mirror-choice" data-answer="YES">YES</button><button class="mirror-choice" data-answer="NO">NO</button><button class="mirror-choice" data-answer="NOT SURE">I'M NOT SURE</button></div>`);
}
function showMirrorResponse(answer) {
    const responses = { YES: ["Then your life should be able to show it.", "Belief is easy to claim.<br>The interesting part is what happens next."], NO: ["Good.", "At least you're not lying to yourself.<br>Now you have something real to work with."], "NOT SURE": ["Then let's find out.", "You don't need to pretend you know.<br>The game will reveal it through your decisions."] };
    progression.events.push({ id: makeId(), type: "mirror-reflection", impact: "reflection", title: "Answered the mirror", details: `Response: ${answer}`, createdAt: new Date().toISOString() });
    saveProgression();
    setScreen(`<p class="small-text">THE MIRROR</p><h2>${responses[answer][0]}</h2><p class="subtitle">${responses[answer][1]}</p><button id="continue-game-button">CONTINUE</button>`);
}
function showFirstEncounter() {
    const stats = ["FINANCIAL", "RESPONSIBILITY", "COURAGE", "RELATIONSHIPS", "FAITH", "CREATIVITY", "PHYSICAL", "COMFORT"];
    setScreen(`<p class="small-text">CHARACTER SYSTEM</p><h2>WHAT MATTERS TO YOU?</h2><p class="subtitle">Not what sounds impressive or what you think you're supposed to choose.<br><br><strong>What actually matters to you?</strong></p><div class="stat-options">${stats.map(stat => `<button class="stat-choice ${progression.profile.chosenStats.includes(stat) ? "selected" : ""}" data-stat="${stat}">${stat}</button>`).join("")}</div><p class="selection-hint">Choose the things you genuinely want this game to pay attention to.</p><button id="build-character-button">BUILD MY GAME</button>`);
}
function showCharacterSheet() {
    const stats = progression.profile.chosenStats.map(stat => `<div class="stat"><span>${esc(stat)}</span><strong>0</strong></div>`).join("");
    setScreen(`<p class="small-text">CHARACTER CREATED · DAY ${dayNumber()}</p><h2>${esc(progression.profile.description || "YOUR LIFE, IN PROGRESS")}</h2><p class="subtitle">These are things your life may give you opportunities to develop.</p><div class="stats">${stats || ""}</div><button id="begin-life-button">BEGIN</button>`);
}

function showWorld(skipQuestion = false) {
    setScreen(`<p class="small-text">THE WORLD · DAY ${dayNumber()}</p><h2>YOU ARE HERE.</h2><p class="subtitle">Your life is already happening.<br><br>The game isn't here to replace it.<br>It is simply here when you choose to enter.</p><div class="world-message"><p>Nothing is demanding your attention.</p><p>There is no mission waiting for you.</p><p>You can simply be here.</p><p class="world-xp">LEVEL ${levelInfo(totalXP()).level} · ${totalXP()} XP</p></div><nav class="world-actions"><button id="mirror-button">MIRROR</button><button id="life-button">WHAT'S HAPPENING?</button><button data-action="open-progression">CHARACTER PROGRESSION</button><button data-action="open-history">HISTORY & REFLECTION</button><button data-action="open-questioner">QUESTIONER</button><button data-action="open-settings">DATA & SETTINGS</button><button id="leave-button">LEAVE GAME</button></nav>`);
    if (!skipQuestion) maybeSurfaceQuestion();
}
function showExitScreen() {
    setScreen(`<p class="small-text">GAME PAUSED</p><h2>GO LIVE.</h2><p class="subtitle">Nothing here needs to be completed right now.<br><br>Go play the actual game.</p><button id="return-button">RETURN</button>`);
}

function categoryMarkup(category) {
    const catLevel = levelInfo(categoryXP(category));
    const subcategories = category.subcategories.filter(sub => showArchivedItems || !sub.archivedAt).map(sub => {
        const actions = sub.actions.filter(action => showArchivedItems || !action.archivedAt).map(action => {
            const earned = action.awards.reduce((sum, award) => sum + (Number(award.xp) || 0), 0);
            const archived = Boolean(category.archivedAt || sub.archivedAt || action.archivedAt);
            const canRestore = archived && !category.archivedAt && !sub.archivedAt && action.archivedAt;
            return `<div class="xp-action ${archived ? "archived-item" : ""}"><div class="xp-action-copy"><strong>${esc(action.name)}${archived ? " · ARCHIVED" : ""}</strong><span>${formatXP(action.xp)} each · ${formatXP(earned)} earned · ${action.awards.length} records</span></div><div class="xp-action-buttons">${archived ? (canRestore ? `<button class="icon-button" data-action="restore-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">RESTORE</button>` : "") : `<button class="compact-button" data-action="complete" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">RECORD</button><button class="icon-button" data-action="edit-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">EDIT</button><button class="icon-button" data-action="move-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">MOVE</button><button class="icon-button" data-action="archive-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">DELETE</button><button class="icon-button" data-action="up-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">↑</button><button class="icon-button" data-action="down-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">↓</button>`}</div></div>`;
        }).join("");
        const subArchived = Boolean(category.archivedAt || sub.archivedAt);
        return `<div class="xp-subcategory ${subArchived ? "archived-item" : ""}"><div class="xp-subcategory-heading"><div><h4>${esc(sub.name)}${subArchived ? " · ARCHIVED" : ""}</h4><span>${formatXP(allAwards(sub.actions))}</span></div><div class="xp-action-buttons">${subArchived ? (!category.archivedAt && sub.archivedAt ? `<button class="icon-button" data-action="restore-sub" data-cat="${category.id}" data-id="${sub.id}">RESTORE</button>` : "") : `<button class="icon-button" data-action="edit-sub" data-cat="${category.id}" data-id="${sub.id}">RENAME</button><button class="icon-button" data-action="move-sub" data-cat="${category.id}" data-id="${sub.id}">MOVE</button><button class="icon-button" data-action="archive-sub" data-cat="${category.id}" data-id="${sub.id}">DELETE</button><button class="icon-button" data-action="up-sub" data-cat="${category.id}" data-id="${sub.id}">↑</button><button class="icon-button" data-action="down-sub" data-cat="${category.id}" data-id="${sub.id}">↓</button>`}</div></div>${actions || '<p class="empty-note">Add actions that feel meaningful to you.</p>'}${!subArchived ? `<button class="text-button" data-action="add-action" data-cat="${category.id}" data-id="${sub.id}">+ ADD ACTION</button>` : ""}</div>`;
    }).join("");
    return `<article class="xp-category ${category.archivedAt ? "archived-item" : ""}"><header class="xp-category-heading"><div><h3>${esc(category.name)}${category.archivedAt ? " · ARCHIVED" : ""}</h3><span>${formatXP(categoryXP(category))} · LEVEL ${catLevel.level}</span><div class="mini-track"><div style="width:${catLevel.progress}%"></div></div></div><div class="xp-action-buttons">${category.archivedAt ? `<button class="icon-button" data-action="restore-cat" data-id="${category.id}">RESTORE</button>` : `<button class="icon-button" data-action="edit-cat" data-id="${category.id}">RENAME</button><button class="icon-button" data-action="archive-cat" data-id="${category.id}">DELETE</button><button class="icon-button" data-action="up-cat" data-id="${category.id}">↑</button><button class="icon-button" data-action="down-cat" data-id="${category.id}">↓</button>`}</div></header>${subcategories || '<p class="empty-note">Add a subcategory to begin.</p>'}${!category.archivedAt ? `<button class="text-button" data-action="add-sub" data-id="${category.id}">+ ADD SUBCATEGORY</button>` : ""}</article>`;
}
function showProgression() {
    const xp = totalXP(), level = levelInfo(xp);
    const categories = progression.categories.filter(category => showArchivedItems || !category.archivedAt).map(categoryMarkup).join("");
    setScreen(`<p class="small-text">DAY ${dayNumber()} · CHARACTER PROGRESSION</p><h2>GROW AT YOUR OWN PACE.</h2><p class="subtitle">Started ${esc(progression.startedOn)}. Record real actions when you choose. XP is yours to value and adjust.</p>
        <section class="level-card"><div class="level-topline"><span>LEVEL ${level.level}</span><strong>${xp} TOTAL XP</strong></div><p class="today-xp">${todayXP()} XP recorded today</p><div class="progress-track" role="progressbar" aria-label="Progress to next level" aria-valuenow="${Math.round(level.progress)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${level.progress}%"></div></div><p>${level.next - xp} XP to level ${level.level + 1} <span>· ${level.floor} / ${level.next} XP</span></p></section>
        <div class="progression-settings"><label>XP to level 2 <input id="level-first" type="number" min="1" value="${progression.leveling.firstLevelXP}"></label><label>Additional XP per level <input id="level-step" type="number" min="0" value="${progression.leveling.stepXP}"></label><button class="icon-button" data-action="save-levels">SAVE LEVEL RULES</button></div>
        <div class="xp-heading"><h3>YOUR CATEGORIES</h3><div><button class="compact-button" data-action="add-cat">+ CATEGORY</button><button class="icon-button" data-action="toggle-archived">${showArchivedItems ? "HIDE ARCHIVED" : "SHOW ARCHIVED"}</button></div></div><div class="xp-categories">${categories || '<p class="empty-note">Create a category that reflects what matters in your life.</p>'}</div>
        <div class="data-tools"><button class="icon-button" data-action="export-backup">DOWNLOAD BACKUP</button><button class="icon-button" data-action="import-backup">RESTORE BACKUP</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div><button class="back-button" data-action="back-world">BACK TO THE WORLD</button>`);
}

function addCategory() {
    const name = prompt("Category name:"); if (!name?.trim()) return;
    progression.categories.push({ id: makeId(), name: name.trim(), subcategories: [], archivedAt: null }); persistAndShow();
}
function addSubcategory(category) {
    if (!category) return;
    const name = prompt(`Subcategory name for ${category.name}:`); if (!name?.trim()) return;
    category.subcategories.push({ id: makeId(), name: name.trim(), actions: [], archivedAt: null }); persistAndShow();
}
function addAction(subcategory) {
    if (!subcategory) return;
    const name = prompt(`Action name for ${subcategory.name}:`); if (!name?.trim()) return;
    const rawXP = prompt("XP awarded for each completion?", "5"); if (rawXP === null) return;
    const xp = Number(rawXP); if (!Number.isFinite(xp) || xp < 0) { alert("Enter XP of 0 or more."); return; }
    subcategory.actions.push({ id: makeId(), name: name.trim(), xp, awards: [], archivedAt: null }); persistAndShow();
}
function promptMoveSubcategory(category, subcategory) {
    const targets = progression.categories.filter(item => item.id !== category.id && !item.archivedAt);
    if (!targets.length) { alert("Create another category before moving this subcategory."); return; }
    const menu = targets.map((target, index) => `${index + 1}. ${target.name}`).join("\n");
    const choice = Number(prompt(`Move “${subcategory.name}” to which category?\n${menu}`));
    if (!Number.isInteger(choice) || choice < 1 || choice > targets.length) return;
    category.subcategories = category.subcategories.filter(item => item.id !== subcategory.id);
    targets[choice - 1].subcategories.push(subcategory); persistAndShow();
}
function promptMoveAction(subcategory, action) {
    const targets = allActions().filter(item => !item.category.archivedAt && !item.subcategory.archivedAt).map(item => item.subcategory).filter((item, index, list) => !item.archivedAt && list.findIndex(test => test.id === item.id) === index && item.id !== subcategory.id);
    if (!targets.length) { alert("Create another subcategory before moving this action."); return; }
    const menu = targets.map((target, index) => `${index + 1}. ${target.name}`).join("\n");
    const choice = Number(prompt(`Move “${action.name}” to which subcategory?\n${menu}`));
    if (!Number.isInteger(choice) || choice < 1 || choice > targets.length) return;
    subcategory.actions = subcategory.actions.filter(item => item.id !== action.id);
    targets[choice - 1].actions.push(action); persistAndShow();
}

function showHistory() {
    const records = [...progression.events].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const markup = records.map(record => {
        const kind = record.type === "completion" ? "ACTION COMPLETED" : esc(String(record.type).replaceAll("-", " ").toUpperCase());
        const context = [record.categoryName, record.subcategoryName, record.actionName].filter(Boolean).map(esc).join(" → ");
        const repairButton = record.type === "mistake" ? `<div class="record-buttons"><button class="icon-button" data-action="record-repair" data-id="${record.id}">RECORD REPAIR</button><button class="icon-button" data-action="record-forgiveness" data-id="${record.id}">RECORD FORGIVENESS</button></div>` : "";
        return `<article class="history-card"><p class="small-text">${kind} · ${esc(localDateTime(record.createdAt))}</p><h3>${esc(record.title)}</h3>${record.xpAwarded ? `<p class="record-xp">${formatXP(record.xpAwarded)} · already included in total</p>` : ""}${context ? `<p class="record-context">${context}</p>` : ""}${record.details ? `<p>${esc(record.details)}</p>` : ""}${record.affected ? `<p><strong>Affected:</strong> ${esc(record.affected)}</p>` : ""}${record.nextStep ? `<p><strong>Possible next step:</strong> ${esc(record.nextStep)}</p>` : ""}${repairButton}</article>`;
    }).join("");
    const questions = progression.questioner.history.slice().reverse().map(item => `<article class="history-card question-history"><p class="small-text">QUESTIONER · ${esc(localDateTime(item.respondedAt || item.createdAt))} · ${esc(item.status || "asked")}</p><h3>${esc(item.text)}</h3>${item.answer ? `<p>${esc(item.answer)}</p>` : "<p>No answer recorded.</p>"}</article>`).join("");
    setScreen(`<p class="small-text">YOUR RECORD</p><h2>WHAT HAS HAPPENED.</h2><p class="subtitle">Actions, reflections, mistakes, repairs, and answers. Records do not decide your worth or silently change XP.</p><div class="history-tools"><button class="compact-button" data-action="new-record">+ RECORD SOMETHING</button></div><div class="history-list">${markup || '<p class="empty-note">No activity recorded yet.</p>'}</div><h3 class="history-section-title">QUESTIONER ANSWERS</h3><div class="history-list">${questions || '<p class="empty-note">No questions answered yet.</p>'}</div><button class="back-button" data-action="back-world">BACK TO THE WORLD</button>`);
}

function showRecordForm(prefill = {}) {
    const mistakes = progression.events.filter(event => event.type === "mistake");
    const actionOptions = allActions().filter(item => !item.category.archivedAt && !item.subcategory.archivedAt && !item.action.archivedAt).map(item => `<option value="${item.category.id}|${item.subcategory.id}|${item.action.id}">${esc(item.category.name)} → ${esc(item.subcategory.name)} → ${esc(item.action.name)}</option>`).join("");
    const mistakeOptions = mistakes.map(event => `<option value="${event.id}" ${prefill.relatedMistakeId === event.id ? "selected" : ""}>${esc(event.title)} · ${esc(localDateTime(event.createdAt))}</option>`).join("");
    setScreen(`<p class="small-text">LIFE RECORD</p><h2>NOTICE WHAT HAPPENED.</h2><p class="subtitle">Recording a reflection or mistake does not award or remove XP. You decide what a situation means.</p>
        <form id="record-form" class="record-form"><label>What kind of record?<select name="type" id="record-type"><option value="positive" ${prefill.type === "positive" ? "selected" : ""}>Positive action or progress</option><option value="neutral" ${prefill.type === "neutral" ? "selected" : ""}>Neutral action or context</option><option value="counterproductive" ${prefill.type === "counterproductive" ? "selected" : ""}>Something working against my values</option><option value="mistake" ${prefill.type === "mistake" ? "selected" : ""}>Mistake or setback</option><option value="repair" ${prefill.type === "repair" ? "selected" : ""}>Repair attempt</option><option value="reflection" ${prefill.type === "reflection" ? "selected" : ""}>Reflection</option><option value="decision" ${prefill.type === "decision" ? "selected" : ""}>Difficult decision</option></select></label>
        <label>Short title<input name="title" maxlength="120" required value="${esc(prefill.title || "")}" placeholder="What happened or what matters?"></label><label>Details<textarea name="details" rows="4" placeholder="What do you want to remember about the context?">${esc(prefill.details || "")}</textarea></label><label>Who or what was affected?<textarea name="affected" rows="2" placeholder="Optional"></textarea></label><label>Possible next step<textarea name="nextStep" rows="2" placeholder="Optional. No XP is awarded for an intention alone."></textarea></label><label>Related action, if any<select name="actionRef"><option value="">None</option>${actionOptions}</select></label><label class="repair-select">Related mistake, if this is a repair<select name="relatedMistakeId"><option value="">Choose a record</option>${mistakeOptions}</select></label><button class="compact-button" type="submit">SAVE RECORD</button><button class="quiet-button" type="button" data-action="open-history">CANCEL</button></form>`);
}

function showQuestioner() {
    const q = progression.questioner;
    const history = q.history.slice(-5).reverse().map(item => `<li>${esc(item.status || "asked")}: ${esc(item.text)}</li>`).join("");
    setScreen(`<p class="small-text">QUESTIONER</p><h2>A QUESTION, WHEN IT FITS.</h2><p class="subtitle">It only uses things you choose to record here. No monitoring, outside observation, or certainty about your motives. You can answer, dismiss, or postpone without penalty.</p>
        <section class="questioner-settings"><label class="check-label"><input id="questioner-enabled" type="checkbox" ${q.randomEnabled ? "checked" : ""}> Allow occasional random questions</label><div class="question-gap"><label>Minimum interval in days<input id="question-min" type="number" min="1" max="60" value="${q.minDays}"></label><label>Maximum interval in days<input id="question-max" type="number" min="1" max="90" value="${q.maxDays}"></label></div><button class="compact-button" data-action="save-questioner">SAVE QUESTIONER SETTINGS</button><button class="icon-button" data-action="ask-now">ASK A QUESTION NOW</button></section>
        <section class="questioner-settings"><h3>RECENT QUESTIONS</h3><ul>${history || "<li>No questions yet.</li>"}</ul></section><button class="back-button" data-action="back-world">BACK TO THE WORLD</button>`);
}
function showQuestionPrompt(question) {
    setScreen(`<div class="question-prompt"><p class="small-text">A QUESTION FROM LIFE IQ</p><h2>${esc(question.text)}</h2><p class="subtitle">A possibility to consider, based only on what you have entered here. There is no required answer.</p><form id="question-answer-form"><label for="question-answer">Your answer (optional)</label><textarea id="question-answer" rows="4" placeholder="Write if you want to remember your thoughts."></textarea><div class="question-actions"><button class="compact-button" type="submit">SAVE ANSWER</button><button class="icon-button" type="button" data-action="dismiss-question">DISMISS</button><button class="icon-button" type="button" data-action="postpone-question">ASK ME TOMORROW</button></div></form></div>`);
}
function questionHasTrigger(key) {
    return progression.questioner.history.some(item => item.triggerKey === key);
}
function responsiveQuestion() {
    const events = progression.events.filter(event => !event.legacy && event.createdAt);
    const recent = events.filter(event => Date.now() - new Date(event.createdAt).getTime() <= 30 * 86400000);
    const byPattern = new Map();
    recent.filter(event => ["counterproductive", "mistake"].includes(event.type)).forEach(event => {
        const key = `pattern:${event.type}:${String(event.title).trim().toLowerCase()}`;
        if (!byPattern.has(key)) byPattern.set(key, []);
        byPattern.get(key).push(event);
    });
    for (const [key, matches] of byPattern.entries()) {
        const latest = matches[matches.length - 1];
        const prior = progression.questioner.history.find(item => item.triggerKey === key);
        if (matches.length >= 2 && (!prior || new Date(latest.createdAt) > new Date(prior.createdAt))) {
            return { id: "pattern-repeat", triggerKey: key, text: `I noticed you recorded “${latest.title}” more than once. Does it seem like a pattern, or is there context I might be missing?` };
        }
    }
    const unansweredRepair = events.find(event => event.type === "mistake" && !(event.repairIds || []).length && Date.now() - new Date(event.createdAt).getTime() >= 86400000);
    if (unansweredRepair) {
        const key = `repair:${unansweredRepair.id}`;
        if (!questionHasTrigger(key)) return { id: "repair-context", triggerKey: key, text: `You recorded “${unansweredRepair.title}” as a mistake. Would a repair or another next step be appropriate, or has the situation changed?` };
    }
    const difficultDecision = events.find(event => event.type === "decision" && Date.now() - new Date(event.createdAt).getTime() >= 86400000);
    if (difficultDecision) {
        const key = `decision:${difficultDecision.id}`;
        if (!questionHasTrigger(key)) return { id: "decision-reflection", triggerKey: key, text: `You recorded “${difficultDecision.title}” as a difficult decision. Is there a value or concern you want to keep in view as you consider your next step?` };
    }
    const lastAnswer = progression.questioner.history.slice().reverse().find(item => item.status === "answered" && item.answer);
    if (lastAnswer && Date.now() - new Date(lastAnswer.respondedAt).getTime() >= 7 * 86400000 && !questionHasTrigger(`answer:${lastAnswer.id}`)) {
        const quote = lastAnswer.answer.length > 90 ? `${lastAnswer.answer.slice(0, 87)}…` : lastAnswer.answer;
        return { id: "follow-up-answer", triggerKey: `answer:${lastAnswer.id}`, sourceAnswerId: lastAnswer.id, text: `You wrote, “${quote}”. Has anything shifted since then?` };
    }
    const recentProgress = recent.filter(event => event.type === "completion" || event.type === "positive");
    const categoryName = recentProgress[0]?.categoryName;
    const sameCategory = categoryName ? recentProgress.filter(event => event.categoryName === categoryName) : [];
    const lastProgress = sameCategory[sameCategory.length - 1];
    const progressKey = categoryName ? `progress:${categoryName}:${lastProgress?.id}` : "";
    if (sameCategory.length >= 3 && lastProgress && !questionHasTrigger(progressKey)) return { id: "progress-reflection", triggerKey: progressKey, text: `You have recorded several steps in ${categoryName}. What seems to be helping that progress happen?` };
    return null;
}
function chooseRandomQuestion() {
    const recentIds = progression.questioner.history.slice(-5).map(item => item.questionId);
    const available = QUESTION_POOL.filter(item => !recentIds.includes(item.id));
    return available[Math.floor(Math.random() * available.length)] || QUESTION_POOL[0];
}
function maybeSurfaceQuestion() {
    const q = progression.questioner;
    if (q.pending) {
        if (!q.snoozedUntil || q.snoozedUntil <= dateKey()) showQuestionPrompt(q.pending);
        return;
    }
    if (q.snoozedUntil && q.snoozedUntil > dateKey()) return;
    let question = responsiveQuestion();
    if (!question && q.randomEnabled && q.nextRandomOn <= dateKey()) {
        const picked = chooseRandomQuestion();
        question = { ...picked, triggerKey: `random:${picked.id}:${dateKey()}` };
    }
    if (!question) return;
    q.pending = { ...question, createdAt: new Date().toISOString(), source: question.triggerKey.startsWith("random:") ? "random" : "responsive" };
    q.snoozedUntil = null;
    saveProgression();
    showQuestionPrompt(q.pending);
}
function finishQuestion(status, answer = "") {
    const q = progression.questioner, pending = q.pending;
    if (!pending) return;
    q.history.push({ id: makeId(), questionId: pending.id, text: pending.text, triggerKey: pending.triggerKey, sourceAnswerId: pending.sourceAnswerId || null, status, answer: answer.trim(), createdAt: pending.createdAt, respondedAt: new Date().toISOString() });
    q.pending = null;
    q.snoozedUntil = null;
    if (pending.source === "random") q.nextRandomOn = addDays(dateKey(), randomInt(q.minDays, q.maxDays));
    saveProgression();
    showWorld(true);
}

function showSettings() {
    setScreen(`<p class="small-text">DATA & SETTINGS</p><h2>YOUR SIMULATION, YOURS TO KEEP.</h2><p class="subtitle">This site saves to this browser on this device. Export backups regularly if you want protection from cleared browser data or a device change.</p><section class="data-settings"><button class="compact-button" data-action="export-backup">DOWNLOAD A BACKUP</button><button class="icon-button" data-action="import-backup">RESTORE FROM BACKUP</button><input id="backup-file" type="file" accept="application/json,.json" hidden><p>Storage key: <code>${STORAGE_KEY}</code> · saved data version ${progression.schemaVersion}</p><p>Started ${esc(progression.startedOn)} · Day ${dayNumber()}</p><button class="danger-button" data-action="reset-simulation">RESET SIMULATION</button><p class="empty-note">Reset is permanent for this browser. Export a backup first. You will need to type RESET and confirm in a second step.</p></section><button class="back-button" data-action="back-world">BACK TO THE WORLD</button>`);
}
function exportBackup() {
    const backup = { app: "Life IQ", backupVersion: 1, exportedAt: new Date().toISOString(), data: progression };
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file), link = document.createElement("a");
    link.href = url; link.download = `life-iq-backup-${dateKey()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importBackup(file) {
    if (!file) return;
    try {
        const backup = JSON.parse(await file.text());
        const imported = normalizeProgression(backup.data || backup.progression || backup);
        if (!confirm(`Restore ${imported.categories.length} categories and ${imported.events.length} activity records? This replaces the data currently saved in this browser.`)) return;
        if (storageStatus === "unavailable") { alert("Browser storage is unavailable. The current saved record has not been replaced."); return; }
        const previous = progression;
        if (storageStatus === "corrupt") storageStatus = "ready";
        progression = imported;
        if (!saveProgression()) { progression = previous; alert("The backup could not be saved. Your current in-memory data was restored."); return; }
        showWorld();
    } catch (error) { alert("That backup could not be read. Your current data was left unchanged."); }
}
function resetSimulation() {
    if (storageStatus !== "ready") { alert("Reset is unavailable while browser storage is unavailable, because the result could not be saved safely."); return; }
    const typed = prompt("This permanently replaces the saved simulation in this browser. Export a backup first. Type RESET to continue:");
    if (typed !== "RESET") return;
    if (!confirm("Last confirmation: permanently reset this Life IQ simulation on this browser?")) return;
    const previous = progression;
    progression = freshProgression();
    if (!saveProgression()) { progression = previous; alert("The reset could not be saved. Existing data was restored."); return; }
    showWelcome();
}

startScreen.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.action) {
        const { action, id } = button.dataset;
        const category = findCategory(button.dataset.cat || id);
        const subcategory = findSubcategory(button.dataset.cat, button.dataset.sub || id);
        const item = findAction(button.dataset.cat, button.dataset.sub, id);
        if (action === "back-world") showWorld(true);
        if (action === "open-progression") showProgression();
        if (action === "open-history") showHistory();
        if (action === "open-questioner") showQuestioner();
        if (action === "open-settings") showSettings();
        if (action === "new-record") showRecordForm();
        if (action === "add-cat") addCategory();
        if (action === "add-sub") addSubcategory(category);
        if (action === "add-action") addAction(subcategory);
        if (action === "complete" && item) {
            const award = { xp: Number(item.xp), earnedAt: new Date().toISOString() };
            item.awards.push(award);
            progression.events.push({ id: makeId(), type: "completion", impact: "positive", title: item.name, details: "Action completion recorded by the user.", categoryId: category.id, categoryName: category.name, subcategoryId: subcategory.id, subcategoryName: subcategory.name, actionId: item.id, actionName: item.name, xpAwarded: award.xp, createdAt: award.earnedAt });
            persistAndShow("progression");
        }
        if (action === "edit-cat" && category) { const value = prompt("Rename category:", category.name); if (value?.trim()) { category.name = value.trim(); progression.events.forEach(event => { if (event.categoryId === category.id) event.categoryName = category.name; }); persistAndShow(); } }
        if (action === "archive-cat" && category && confirm(`Hide “${category.name}” from your active categories? Its XP and history will be kept. Restore it later with SHOW ARCHIVED.`)) { category.archivedAt = new Date().toISOString(); persistAndShow(); }
        if (action === "restore-cat" && category) { category.archivedAt = null; persistAndShow(); }
        if (action === "up-cat" || action === "down-cat") { moveWithin(progression.categories, id, action === "up-cat" ? -1 : 1); persistAndShow(); }
        if (action === "edit-sub" && subcategory) { const value = prompt("Rename subcategory:", subcategory.name); if (value?.trim()) { subcategory.name = value.trim(); progression.events.forEach(event => { if (event.subcategoryId === subcategory.id) event.subcategoryName = subcategory.name; }); persistAndShow(); } }
        if (action === "archive-sub" && category && subcategory && confirm(`Hide “${subcategory.name}” and its actions? XP and history will be kept.`)) { subcategory.archivedAt = new Date().toISOString(); persistAndShow(); }
        if (action === "restore-sub" && subcategory) { subcategory.archivedAt = null; persistAndShow(); }
        if (action === "move-sub" && category && subcategory) promptMoveSubcategory(category, subcategory);
        if (action === "up-sub" || action === "down-sub") { moveWithin(category.subcategories, id, action === "up-sub" ? -1 : 1); persistAndShow(); }
        if (action === "edit-action" && item) {
            const name = prompt("Rename action:", item.name); if (!name?.trim()) return;
            const raw = prompt("XP for each future completion:", String(item.xp)); if (raw === null) return;
            const xp = Number(raw); if (!Number.isFinite(xp) || xp < 0) { alert("Enter XP of 0 or more."); return; }
            item.name = name.trim(); item.xp = xp; progression.events.forEach(record => { if (record.actionId === item.id) record.actionName = item.name; }); persistAndShow();
        }
        if (action === "archive-action" && item && confirm(`Hide “${item.name}” from the active list? Earned XP and activity history will be kept.`)) { item.archivedAt = new Date().toISOString(); persistAndShow(); }
        if (action === "restore-action" && item) { item.archivedAt = null; persistAndShow(); }
        if (action === "move-action" && item && subcategory) promptMoveAction(subcategory, item);
        if (action === "up-action" || action === "down-action") { moveWithin(subcategory.actions, id, action === "up-action" ? -1 : 1); persistAndShow(); }
        if (action === "save-levels") {
            const first = Number(document.getElementById("level-first").value), step = Number(document.getElementById("level-step").value);
            if (!Number.isFinite(first) || first < 1 || !Number.isFinite(step) || step < 0) { alert("Level 2 must be at least 1 XP; additional XP must be 0 or more."); return; }
            progression.leveling = { firstLevelXP: first, stepXP: step }; persistAndShow();
        }
        if (action === "toggle-archived") { showArchivedItems = !showArchivedItems; showProgression(); }
        if (action === "export-backup") exportBackup();
        if (action === "import-backup") document.getElementById("backup-file")?.click();
        if (action === "save-questioner") {
            const min = Number(document.getElementById("question-min").value), max = Number(document.getElementById("question-max").value);
            if (!Number.isInteger(min) || min < 1 || !Number.isInteger(max) || max < min) { alert("Use whole days, with the maximum at least as large as the minimum."); return; }
            progression.questioner.randomEnabled = document.getElementById("questioner-enabled").checked;
            progression.questioner.minDays = min; progression.questioner.maxDays = max;
            progression.questioner.nextRandomOn = addDays(dateKey(), randomInt(min, max)); persistAndShow("questioner");
        }
        if (action === "ask-now") { const question = chooseRandomQuestion(); progression.questioner.pending = { ...question, triggerKey: `manual:${makeId()}`, source: "manual", createdAt: new Date().toISOString() }; saveProgression(); showQuestionPrompt(progression.questioner.pending); }
        if (action === "dismiss-question") finishQuestion("dismissed");
        if (action === "postpone-question") { progression.questioner.snoozedUntil = addDays(dateKey(), 1); saveProgression(); showWorld(true); }
        if (action === "record-repair") showRecordForm({ type: "repair", relatedMistakeId: id });
        if (action === "record-forgiveness") {
            const mistake = progression.events.find(record => record.id === id);
            const reflection = prompt("This keeps the mistake in your history. What are you choosing to release or carry forward? (Optional)");
            if (reflection === null) return;
            progression.events.push({ id: makeId(), type: "forgiveness", impact: "reflection", title: `Choosing how to move forward: ${mistake?.title || "recorded mistake"}`, details: reflection.trim(), relatedMistakeId: id, createdAt: new Date().toISOString() });
            if (mistake) mistake.forgivenAt = new Date().toISOString();
            persistAndShow("history");
        }
        if (action === "reset-simulation") resetSimulation();
        return;
    }
    if (button.id === "start-button") showCharacterCreation();
    if (button.id === "continue-button") {
        const description = document.getElementById("character-input").value.trim();
        if (!description) { alert("Tell me something first."); return; }
        progression.profile.description = description; saveProgression(); showMirror();
    }
    if (button.classList.contains("mirror-choice")) showMirrorResponse(button.dataset.answer);
    if (button.id === "continue-game-button") showFirstEncounter();
    if (button.id === "begin-life-button") { progression.profile.setupComplete = true; saveProgression(); showWorld(); }
    if (button.id === "return-button") showWorld();
    if (button.id === "leave-button") showExitScreen();
    if (button.id === "mirror-button") showMirror();
    if (button.id === "life-button") showRecordForm();
    if (button.classList.contains("stat-choice")) {
        const stat = button.dataset.stat;
        progression.profile.chosenStats = progression.profile.chosenStats.includes(stat) ? progression.profile.chosenStats.filter(value => value !== stat) : [...progression.profile.chosenStats, stat];
        button.classList.toggle("selected"); saveProgression();
    }
    if (button.id === "build-character-button") {
        if (!progression.profile.chosenStats.length) { alert("Choose at least one thing that matters to you."); return; }
        showCharacterSheet();
    }
});

startScreen.addEventListener("submit", event => {
    event.preventDefault();
    if (event.target.id === "record-form") {
        const form = new FormData(event.target), type = String(form.get("type")), actionRef = String(form.get("actionRef") || "");
        const title = String(form.get("title") || "").trim(); if (!title) return;
        const [categoryId, subcategoryId, actionId] = actionRef ? actionRef.split("|") : [];
        const category = categoryId ? findCategory(categoryId) : null, subcategory = category ? findSubcategory(categoryId, subcategoryId) : null, action = subcategory ? findAction(categoryId, subcategoryId, actionId) : null;
        const record = { id: makeId(), type, impact: type, title, details: String(form.get("details") || "").trim(), affected: String(form.get("affected") || "").trim(), nextStep: String(form.get("nextStep") || "").trim(), relatedMistakeId: String(form.get("relatedMistakeId") || "") || null, categoryId: category?.id || null, categoryName: category?.name || null, subcategoryId: subcategory?.id || null, subcategoryName: subcategory?.name || null, actionId: action?.id || null, actionName: action?.name || null, createdAt: new Date().toISOString() };
        progression.events.push(record);
        if (type === "repair" && record.relatedMistakeId) {
            const mistake = progression.events.find(item => item.id === record.relatedMistakeId);
            if (mistake) { mistake.repairIds ||= []; mistake.repairIds.push(record.id); }
        }
        persistAndShow("history");
    }
    if (event.target.id === "question-answer-form") {
        const answer = document.getElementById("question-answer").value.trim();
        if (!answer) { alert("Write an answer or choose dismiss/postpone. There is no penalty for leaving it unanswered."); return; }
        finishQuestion("answered", answer);
    }
});

startScreen.addEventListener("change", event => {
    if (event.target.id === "backup-file") importBackup(event.target.files[0]).finally(() => { event.target.value = ""; });
});

if (progression.profile.setupComplete) showWorld();
else showWelcome();
