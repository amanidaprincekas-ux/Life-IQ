const startScreen = document.getElementById("start-screen");
const STORAGE_KEY = "life-game-progression-v1";
let characterDescription = "";
let selectedStats = [];
let progression = loadProgression();

function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function loadProgression() {
    const example = { categories: [
        { name: "Health", subcategories: [{ name: "Basketball", actions: [{ name: "Play basketball", xp: 5 }, { name: "Work on conditioning or jumping", xp: 20 }] }, { name: "Strength Training", actions: [] }] },
        { name: "Spirituality", subcategories: [{ name: "Faith", actions: [{ name: "Return to God when I don't feel like it", xp: 15 }] }, { name: "Fasting", actions: [] }, { name: "Obedience", actions: [] }] },
        { name: "Live S2S", subcategories: [{ name: "Project development", actions: [] }, { name: "Testing ideas", actions: [] }, { name: "Completing and shipping features", actions: [] }] },
        { name: "Time & Responsibilities", subcategories: [{ name: "Planning", actions: [] }, { name: "Time management", actions: [] }, { name: "Following through on responsibilities", actions: [] }] }
    ], leveling: { firstLevelXP: 100, stepXP: 50 } };
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved && Array.isArray(saved.categories) && saved.leveling) return saved;
    } catch (error) { console.warn("Could not load saved progress.", error); }
    example.categories.forEach(category => {
        category.id = makeId();
        category.subcategories.forEach(subcategory => {
            subcategory.id = makeId();
            subcategory.actions.forEach(action => { action.id = makeId(); action.awards = []; });
        });
    });
    return example;
}
function saveProgression() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progression)); }
    catch (error) { alert("Progress could not be saved in this browser."); }
}
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }
function earned(actions) { return actions.reduce((sum, action) => sum + action.awards.reduce((a, b) => a + b, 0), 0); }
function categoryXP(category) { return category.subcategories.reduce((sum, sub) => sum + earned(sub.actions), 0); }
function totalXP() { return progression.categories.reduce((sum, category) => sum + categoryXP(category), 0); }
function levelInfo(xp) {
    const first = Math.max(1, Number(progression.leveling.firstLevelXP) || 100);
    const step = Math.max(0, Number(progression.leveling.stepXP) || 0);
    let level = 1, floor = 0, next = first;
    while (xp >= next && level < 100000) { floor = next; level++; next += step; if (step === 0) next = floor + first; }
    return { level, floor, next, progress: Math.min(100, ((xp - floor) / (next - floor)) * 100) };
}
function saveAndRender() { saveProgression(); showProgression(); }
function addCategory() {
    const name = prompt("Category name:"); if (!name?.trim()) return;
    progression.categories.push({ id: makeId(), name: name.trim(), subcategories: [] }); saveAndRender();
}
function addSubcategory(category) {
    const name = prompt(`Subcategory name for ${category.name}:`); if (!name?.trim()) return;
    category.subcategories.push({ id: makeId(), name: name.trim(), actions: [] }); saveAndRender();
}
function addAction(subcategory) {
    const name = prompt(`Action name for ${subcategory.name}:`); if (!name?.trim()) return;
    const raw = prompt("XP awarded for each completion?", "5"); if (raw === null) return;
    const xp = Number(raw); if (!Number.isFinite(xp) || xp < 0) { alert("Enter XP of 0 or more."); return; }
    subcategory.actions.push({ id: makeId(), name: name.trim(), xp, awards: [] }); saveAndRender();
}
function showProgression() {
    const xp = totalXP(), level = levelInfo(xp);
    const categories = progression.categories.map(category => {
        const subs = category.subcategories.map(sub => {
            const actions = sub.actions.map(action => `<div class="xp-action"><div class="xp-action-copy"><strong>${esc(action.name)}</strong><span>${action.xp} XP each · ${earned([action])} XP earned</span></div><div class="xp-action-buttons"><button class="compact-button" data-action="complete" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">RECORD</button><button class="icon-button" data-action="edit-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">EDIT</button><button class="icon-button" data-action="delete-action" data-cat="${category.id}" data-sub="${sub.id}" data-id="${action.id}">DELETE</button></div></div>`).join("");
            return `<div class="xp-subcategory"><div class="xp-subcategory-heading"><div><h4>${esc(sub.name)}</h4><span>${earned(sub.actions)} XP</span></div><div class="xp-action-buttons"><button class="icon-button" data-action="edit-sub" data-cat="${category.id}" data-id="${sub.id}">RENAME</button><button class="icon-button" data-action="delete-sub" data-cat="${category.id}" data-id="${sub.id}">DELETE</button></div></div>${actions || '<p class="empty-note">Add actions that feel meaningful to you.</p>'}<button class="text-button" data-action="add-action" data-cat="${category.id}" data-id="${sub.id}">+ ADD ACTION</button></div>`;
        }).join("");
        return `<article class="xp-category"><header class="xp-category-heading"><div><h3>${esc(category.name)}</h3><span>${categoryXP(category)} XP</span></div><div class="xp-action-buttons"><button class="icon-button" data-action="edit-cat" data-id="${category.id}">RENAME</button><button class="icon-button" data-action="delete-cat" data-id="${category.id}">DELETE</button></div></header>${subs || '<p class="empty-note">Add a subcategory to begin.</p>'}<button class="text-button" data-action="add-sub" data-id="${category.id}">+ ADD SUBCATEGORY</button></article>`;
    }).join("");
    startScreen.innerHTML = `<p class="small-text">CHARACTER PROGRESSION</p><h2>GROW AT YOUR OWN PACE.</h2><p class="subtitle">Record real actions when you choose. XP is yours to value and adjust.</p>
        <section class="level-card"><div class="level-topline"><span>LEVEL ${level.level}</span><strong>${xp} TOTAL XP</strong></div><div class="progress-track" role="progressbar" aria-label="Progress to next level" aria-valuenow="${Math.round(level.progress)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${level.progress}%"></div></div><p>${level.next - xp} XP to level ${level.level + 1} <span>· ${level.floor} / ${level.next} XP</span></p></section>
        <div class="progression-settings"><label>XP to level 2 <input id="level-first" type="number" min="1" value="${progression.leveling.firstLevelXP}"></label><label>Additional XP per level <input id="level-step" type="number" min="0" value="${progression.leveling.stepXP}"></label><button class="icon-button" data-action="save-levels">SAVE LEVEL RULES</button></div>
        <div class="xp-heading"><h3>YOUR CATEGORIES</h3><button class="compact-button" data-action="add-cat">+ CATEGORY</button></div><div class="xp-categories">${categories || '<p class="empty-note">Create a category that reflects what matters in your life.</p>'}</div>
        <button class="back-button" data-action="back">BACK TO THE WORLD</button><p class="selection-hint">No streaks. No reminders. This is here when you want to notice real progress.</p>`;
}

startScreen.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.action) {
        const { action, id } = button.dataset;
        const category = progression.categories.find(item => item.id === (button.dataset.cat || id));
        const sub = category?.subcategories.find(item => item.id === (button.dataset.sub || id));
        const item = sub?.actions.find(item => item.id === id);
        if (action === "add-cat") addCategory();
        if (action === "add-sub") addSubcategory(category);
        if (action === "add-action") addAction(sub);
        if (action === "complete" && item) { item.awards.push(Number(item.xp)); saveAndRender(); }
        if (action === "edit-cat" && category) { const v = prompt("Rename category:", category.name); if (v?.trim()) { category.name = v.trim(); saveAndRender(); } }
        if (action === "delete-cat" && category && confirm(`Delete “${category.name}” and its progress?`)) { progression.categories = progression.categories.filter(x => x.id !== category.id); saveAndRender(); }
        if (action === "edit-sub" && sub) { const v = prompt("Rename subcategory:", sub.name); if (v?.trim()) { sub.name = v.trim(); saveAndRender(); } }
        if (action === "delete-sub" && sub && confirm(`Delete “${sub.name}”, its actions and progress?`)) { category.subcategories = category.subcategories.filter(x => x.id !== sub.id); saveAndRender(); }
        if (action === "edit-action" && item) {
            const name = prompt("Rename action:", item.name); if (!name?.trim()) return;
            const raw = prompt("XP for each future completion:", String(item.xp)); if (raw === null) return;
            const xp = Number(raw); if (!Number.isFinite(xp) || xp < 0) { alert("Enter XP of 0 or more."); return; }
            item.name = name.trim(); item.xp = xp; saveAndRender();
        }
        if (action === "delete-action" && item && confirm(`Delete “${item.name}” and its recorded progress?`)) { sub.actions = sub.actions.filter(x => x.id !== item.id); saveAndRender(); }
        if (action === "save-levels") {
            const first = Number(document.getElementById("level-first").value), step = Number(document.getElementById("level-step").value);
            if (!Number.isFinite(first) || first < 1 || !Number.isFinite(step) || step < 0) { alert("Level 2 must be at least 1 XP; additional XP must be 0 or more."); return; }
            progression.leveling = { firstLevelXP: first, stepXP: step }; saveAndRender();
        }
        if (action === "back") showWorld();
        return;
    }
    if (button.id === "start-button") showCharacterCreation();
    if (button.id === "continue-button") { characterDescription = document.getElementById("character-input").value.trim(); if (!characterDescription) { alert("Tell me something first."); return; } showMirror(); }
    if (button.classList.contains("mirror-choice")) showMirrorResponse(button.dataset.answer);
    if (button.id === "begin-life-button" || button.id === "return-button") showWorld();
    if (button.id === "leave-button") showExitScreen();
    if (button.id === "continue-game-button") showFirstEncounter();
    if (button.id === "mirror-button") showMirror();
    if (button.id === "life-button") showFirstEncounter();
    if (button.id === "progression-button") showProgression();
    if (button.classList.contains("stat-choice")) button.classList.toggle("selected");
    if (button.id === "build-character-button") { selectedStats = Array.from(document.querySelectorAll(".stat-choice.selected"), b => b.dataset.stat); if (!selectedStats.length) { alert("Choose at least one thing that matters to you."); return; } showCharacterSheet(); }
});

function showCharacterCreation() {
    startScreen.innerHTML = `<p class="small-text">CHARACTER CREATION</p><h2>WHO DO YOU WANT TO BECOME?</h2><p class="subtitle">This is not a test.<br>There is no right answer.</p><textarea id="character-input" placeholder="Describe the man you want to become..."></textarea><br><br><button id="continue-button">CONTINUE</button>`;
}
function showMirror() {
    startScreen.innerHTML = `<p class="small-text">THE MIRROR</p><h2>ARE YOU WALKING IN TRUTH?</h2><p class="subtitle">You said you want to become:</p><div class="character-statement">“${esc(characterDescription)}”</div><p class="subtitle">Do you genuinely believe that?</p><div class="choice-container"><button class="mirror-choice" data-answer="YES">YES</button><button class="mirror-choice" data-answer="NO">NO</button><button class="mirror-choice" data-answer="NOT SURE">I'M NOT SURE</button></div>`;
}
function showMirrorResponse(answer) {
    const responses = { YES: ["Then your life should be able to show it.", "Belief is easy to claim.<br>The interesting part is what happens next."], NO: ["Good.", "At least you're not lying to yourself.<br>Now you have something real to work with."], "NOT SURE": ["Then let's find out.", "You don't need to pretend you know.<br>The game will reveal it through your decisions."] };
    startScreen.innerHTML = `<p class="small-text">THE MIRROR</p><h2>${responses[answer][0]}</h2><p class="subtitle">${responses[answer][1]}</p><button id="continue-game-button">CONTINUE</button>`;
}
function showFirstEncounter() {
    const stats = ["FINANCIAL", "RESPONSIBILITY", "COURAGE", "RELATIONSHIPS", "FAITH", "CREATIVITY", "PHYSICAL", "COMFORT"];
    startScreen.innerHTML = `<p class="small-text">CHARACTER SYSTEM</p><h2>THE RULES OF YOUR GAME</h2><p class="subtitle">You told me who you want to become.<br><br>Now tell me what matters.<br><br>Not what sounds impressive.<br>Not what you think you're supposed to choose.<br><br><strong>What actually matters to you?</strong></p><div class="stat-options">${stats.map(stat => `<button class="stat-choice" data-stat="${stat}">${stat}</button>`).join("")}</div><p class="selection-hint">Choose the things you genuinely want this game to pay attention to.</p><button id="build-character-button">BUILD MY GAME</button>`;
}
function showCharacterSheet() {
    startScreen.innerHTML = `<p class="small-text">CHARACTER CREATED</p><h2>${esc(characterDescription)}</h2><p class="subtitle">These are the things your life will actually give you opportunities to develop.</p><div class="stats">${selectedStats.map(stat => `<div class="stat"><span>${stat}</span><strong>0</strong></div>`).join("")}</div><button id="begin-life-button">BEGIN</button>`;
}
function showWorld() {
    startScreen.innerHTML = `<p class="small-text">THE WORLD</p><h2>YOU ARE HERE.</h2><p class="subtitle">Your life is already happening.<br><br>The game isn't here to replace it.<br>It is simply here when you choose to enter.</p><div class="world-message"><p>Nothing is demanding your attention.</p><p>There is no mission waiting for you.</p><p>You can simply be here.</p></div><div class="world-actions"><button id="mirror-button">MIRROR</button><button id="life-button">WHAT'S HAPPENING?</button><button id="progression-button">CHARACTER PROGRESSION</button><button id="leave-button">LEAVE GAME</button></div>`;
}
function showExitScreen() {
    startScreen.innerHTML = `<p class="small-text">GAME PAUSED</p><h2>GO LIVE.</h2><p class="subtitle">Nothing here needs to be completed right now.<br><br>Go play the actual game.</p><button id="return-button">RETURN</button>`;
}
