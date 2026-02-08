// ── Sounds ─────────────────────────────────────────────────
const startSound = new Audio('./sounds/start-sound.mp3');
startSound.volume = 0.8;
const potionSound = new Audio('./sounds/grace.mp3');
potionSound.volume = 0.6;
const itemSound = new Audio('./sounds/item.mp3');
itemSound.volume = 0.7;
const felledSound = new Audio('./sounds/enemy-felled.mp3');
felledSound.volume = 0.7;
const bossHitSound = new Audio('./sounds/critical.mp3');
bossHitSound.volume = 0.7;
const playerHitSound = new Audio('./sounds/player-hit.mp3');
playerHitSound.volume = 0.7;
const diedSound = new Audio('./sounds/died.mp3');
diedSound.volume = 0.7;
const bossStartSound = new Audio('./sounds/torrent.mp3');
bossStartSound.volume = 0.7;

// ── Game logic ──────────────────────────────────────────────────
let words = [];
let currentIndex = 0;
let score = 0;
let mistakes = [];
let wordData = [];
let hasUserInteracted = false;
let isRetestMode = false;
let isBossMode = false;
let bossHealthPercent = 100;
let originalWordsLength = 0;
let autoSpeakEnabled = true;
let isAnswering = false;

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const STORAGE_KEY = 'spellingGameLists';
const MISTAKE_KEY = 'spellingMistakes';
let mistakeCounts = JSON.parse(localStorage.getItem(MISTAKE_KEY) || '{}');

const bossNames = [
    "Margit, the Fell Omen",
    "Godrick the Grafted",
    "Rennala, Queen of the Full Moon",
    "Starscourge Radahn",
    "Rykard, Lord of Blasphemy",
    "Morgott, the Omen King",
    "Fire Giant",
    "Maliketh, the Black Blade",
    "Godfrey, First Elden Lord / Hoarah Loux",
    "Radagon of the Golden Order / Elden Beast",
    "Divine Beast Dancing Lion",
    "Rellana, Twin Moon Knight",
    "Golden Hippopotamus",
    "Messmer the Impaler",
    "Putrescent Knight",
    "Commander Gaius",
    "Scadutree Avatar",
    "Romina, Saint of the Bud",
    "Metyr, Mother of Fingers",
    "Midra, Lord of Frenzied Flame",
    "Bayle the Dread",
    "Promised Consort Radahn / Radahn, Consort of Miquella"
];

const bossPic = [
    "./pictures/margit.jpg",
    "./pictures/godrick.jpg",
    "./pictures/rennala.jpeg",
    "./pictures/radahn.jpg",
    "./pictures/rykard.jpeg",
    "./pictures/morgott.jpeg",
    "./pictures/fire-giant.jpeg",
    "./pictures/maliketh.jpeg"
]

const synth = window.speechSynthesis;
let voice = null;

function initVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    voice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft'))) 
        || voices.find(v => v.lang.startsWith('en')) 
        || voices[0];
}

if (synth) {
    synth.onvoiceschanged = initVoice;
    initVoice();
}

function speak(text, rate = 0.92) {
    if (!synth || !voice || !hasUserInteracted) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;
    utterance.onend = () => setTimeout(() => document.getElementById('user-input').focus(), 200);
    synth.speak(utterance);
}

function bossHitEffect() {
    bossHitSound.currentTime = 0;
    bossHitSound.play().catch(() => {});
}
function playerMissEffect() {
    playerHitSound.currentTime = 0;
    playerHitSound.play().catch(() => {});
}
function updateHealthBar() {
    const bar = document.getElementById('health-bar');
    const percent = Math.max(0, Math.round(bossHealthPercent));
    bar.style.width = percent + '%';
    document.getElementById('boss-title').textContent = `Boss Health: ${percent}%`;

    if (percent < 30) {
        bar.classList.add('low');
        if (percent <= 30 && !document.getElementById('boss-title').dataset.phase2Set) {
            document.getElementById('boss-title').dataset.phase2Set = 'true';
            document.getElementById('boss-title').style.color = '#ffaa00';
            document.getElementById('boss-name').innerHTML += ' <span style="color:#ffaa00;">(Enraged!)</span>';
        }
    }
    document.body.classList.add('boss-shake');
    setTimeout(() => document.body.classList.remove('boss-shake'), 400);
}

function resetGameState() {
    currentIndex = 0;
    score = 0;
    mistakes = [];
    wordData = [];
    isAnswering = false;
    isRetestMode = false;
    isBossMode = false;
    bossHealthPercent = 100;
    originalWordsLength = 0;

    const gameSection = document.getElementById('game-section');
    const resultsSection = document.getElementById('results-section');
    const bossUi = document.getElementById('boss-ui');
    const autoToggle = document.getElementById('auto-speak-toggle');

    gameSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    bossUi.classList.add('hidden');
    autoToggle.classList.add('hidden');

    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = '';
    document.getElementById('victory-title').textContent = '';
    document.getElementById('victory-title').style.color = '';
    document.getElementById('victory-title').style.textShadow = '';
    document.getElementById('score').textContent = '';
    document.getElementById('mistakes').innerHTML = '';
    document.getElementById('retest-button').classList.add('hidden');

    // Reset boss visuals
    document.getElementById('boss-title').textContent = 'Boss Health';
    document.getElementById('boss-title').style.color = '#ff4444';
    document.getElementById('boss-name').innerHTML = '';
    delete document.getElementById('boss-title').dataset.phase2Set;

    document.body.classList.remove('boss-shake');

    if (synth) synth.cancel();
}

async function fetchWordContext(word) {
    const lowerWord = word.toLowerCase();
    if (customContexts[lowerWord]) {
        const ctx = customContexts[lowerWord];
        ctx.targetWord = word;
        return ctx;
    }
    try {
        const response = await fetch(`${API_BASE}${word}`);
        if (!response.ok) throw new Error('Not found');
        const data = await response.json();
        let bestExample = null;
        for (const meaning of data[0].meanings) {
            for (const def of meaning.definitions) {
                if (def.example) {
                    bestExample = def.example;
                    break;
                }
            }
            if (bestExample) break;
        }
        if (bestExample) {
            const regex = new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
            return {
                display: bestExample.replace(regex, '____'),
                speakSentence: bestExample,
                targetWord: word
            };
        } else {
            const def = data[0].meanings[0].definitions[0];
            return {
                display: `What word means: ${def.definition.slice(0, 120)}${def.definition.length > 120 ? '...' : ''}`,
                speakSentence: null,
                targetWord: word
            };
        }
    } catch (e) {}
    return {
        display: `Spell the word: "___"`,
        speakSentence: null,
        targetWord: word
    };
}

function getBossWords(max = 12) {
    return Object.entries(mistakeCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, max)
        .map(([w]) => w);
}

async function prepareAndStartGame(wordsList, isRetest = false, isBoss = false) {
    hasUserInteracted = true;
    isRetestMode = isRetest;
    isBossMode = isBoss;

    if (isBossMode) {
        document.getElementById('submit-button').textContent = 'Strike the Boss! ⚔️';
    } else {
        document.getElementById('submit-button').textContent = 'Cast Incantation 💥';
    }

    words = wordsList;
    originalWordsLength = words.length;

    if (isBossMode) {
        bossHealthPercent = 100;
        const totalMisses = words.reduce((sum, w) => sum + (mistakeCounts[w] || 1), 0);
        const avgMisses = totalMisses / words.length;
        let bossIndex = Math.min(bossNames.length - 1, Math.floor(avgMisses));
        if (avgMisses < 1.5) bossIndex = Math.min(bossNames.length - 1, Math.floor(words.length / 3));
        document.getElementById('boss-name').textContent = bossNames[bossIndex];
        document.getElementById('boss-ui').classList.remove('hidden');
        document.getElementById('auto-speak-toggle').classList.remove('hidden');
        document.getElementById('boss-pic').src = bossPic[bossIndex];
        console.log(bossPic[bossIndex]);
        autoSpeakEnabled = true;
        document.getElementById('auto-speak').checked = true;
        updateHealthBar();
    } else {
        document.getElementById('boss-ui').classList.add('hidden');
        document.getElementById('auto-speak-toggle').classList.add('hidden');
    }

    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');

    if (!isBossMode) {
        startSound.currentTime = 0;
        startSound.play().catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 4000));
    } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    loading.classList.add('hidden');
    document.getElementById('game-section').classList.remove('hidden');
    document.getElementById('game-section').style.opacity = '1';
    document.getElementById('input-section').classList.add('hidden');
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('save-section').classList.add('hidden');

    wordData = [];
    for (const word of words) {
        const ctx = await fetchWordContext(word);
        wordData.push({ word, context: ctx });
    }

    currentIndex = 0;
    score = 0;
    showNextWord();
}

async function startGame(isRetest = false) {
    if (!isRetest) {
        resetGameState();
        const input = document.getElementById('words-input').value.trim();
        if (!input) return alert('Add some words first, Tarnished!');
        const parsedWords = input.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w);
        if (parsedWords.length === 0) return alert('No words found!');
        await prepareAndStartGame(parsedWords, false, false);
    } else {
        if (mistakes.length === 0) {
            alert("No mistakes remain — thou hast conquered!");
            document.getElementById('input-section').classList.remove('hidden');
            return;
        }
        await prepareAndStartGame([...mistakes], true, false);
        mistakes = [];
    }
}

async function startBossBattle() {
    resetGameState();

    const bossWords = getBossWords();
    if (bossWords.length === 0) {
        alert('Boss arena empty! Thy spelling is godlike! 🏆');
        return;
    }
    await prepareAndStartGame(bossWords, false, true);
}

function showNextWord() {
    if (currentIndex >= words.length) return endGame();
    const { display } = wordData[currentIndex].context;
    document.getElementById('sentence').textContent = display;
    document.getElementById('user-input').value = '';
    document.getElementById('feedback').textContent = '';
    document.getElementById('current-word-num').textContent = currentIndex + 1;
    document.getElementById('total-words').textContent = words.length;
    document.getElementById('user-input').focus();

    if (autoSpeakEnabled) {
        playAudioHint();
    }
}

function playAudioHint() {
    const ctx = wordData[currentIndex]?.context;
    if (!ctx) return;
    const word = ctx.targetWord;
    synth.cancel();
    if (ctx.speakSentence) {
        const u = new SpeechSynthesisUtterance(ctx.speakSentence);
        u.voice = voice; u.rate = 0.92; u.pitch = 1.05;
        const fallback = setTimeout(() => speak(`The word is ${word}.`, 0.85), 15000);
        u.onend = () => {
            clearTimeout(fallback);
            setTimeout(() => speak(`The word is ${word}.`, 0.85), 400);
        };
        synth.speak(u);
    } else {
        speak(`The word is ${word}.`, 0.85);
    }
    setTimeout(() => document.getElementById('user-input').focus(), 300);
}

function checkAnswer() {
    if (isAnswering) return;
    isAnswering = true;
    document.getElementById('submit-button').disabled = true;

    hasUserInteracted = true;
    const userAnswer = document.getElementById('user-input').value.trim().toLowerCase();
    if (!userAnswer) {
        isAnswering = false;
        document.getElementById('submit-button').disabled = false;
        return;
    }
    const correct = wordData[currentIndex].word;
    const feedbackEl = document.getElementById('feedback');

    if (userAnswer === correct) {
        score++;
        feedbackEl.textContent = 'ENEMY FELLED!';
        feedbackEl.className = 'correct';
        if (isBossMode) {
            bossHealthPercent -= 100 / originalWordsLength;
            updateHealthBar();
            bossHitEffect();
        }
    } else {
        feedbackEl.innerHTML = 'YOU DIED<br><span style="color:#ffd700;font-size:1.1em;">(' + correct + ')</span>';
        feedbackEl.className = 'wrong';
        mistakeCounts[correct] = (mistakeCounts[correct] || 0) + 1;
        localStorage.setItem(MISTAKE_KEY, JSON.stringify(mistakeCounts));
        mistakes.push(correct);
    
        if (isBossMode) {
            playerMissEffect();
        }
    }

    setTimeout(() => { 
        currentIndex++; 
        showNextWord(); 
        isAnswering = false;
        document.getElementById('submit-button').disabled = false;
    }, 2400);
}

function endGame() {
    document.getElementById('game-section').classList.add('hidden');
    document.getElementById('boss-ui').classList.add('hidden');
    document.getElementById('auto-speak-toggle').classList.add('hidden');
    document.getElementById('results-section').classList.remove('hidden');

    const total = words.length;
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    const titleEl = document.getElementById('victory-title');
    const scoreEl = document.getElementById('score');
    const mistakesDiv = document.getElementById('mistakes');
    const retestBtn = document.getElementById('retest-button');

    titleEl.style.color = '';
    titleEl.style.textShadow = '';
    document.body.classList.remove('boss-shake');

    mistakesDiv.innerHTML = '';

    if (isBossMode) {
        if (bossHealthPercent <= 0.1) bossHealthPercent = 0;
        updateHealthBar();

        if (bossHealthPercent <= 0) {
            titleEl.textContent = 'BOSS SLAIN! 💀';
            scoreEl.textContent = `🔥 Boss Defeated! ${score}/${total} (${percent}%) 🔥`;
            felledSound.play().catch(() => {});
            words.forEach(w => {
                if (mistakeCounts[w]) {
                    mistakeCounts[w] = Math.floor(mistakeCounts[w] / 2);
                }
            });
            localStorage.setItem(MISTAKE_KEY, JSON.stringify(mistakeCounts));
            retestBtn.classList.add('hidden');
        } else {
            diedSound.play().catch(() => {});
            titleEl.textContent = 'YOU DIED';
            titleEl.style.color = '#ff3333';
            titleEl.style.textShadow = '0 0 20px #ff0000aa';
            scoreEl.innerHTML = `The boss yet stands...<br><span style="color:#ff4444;font-size:1.3em;">${score}/${total} (${percent}%)</span><br>Health remaining: ${Math.ceil(bossHealthPercent)}%`;
            retestBtn.classList.remove('hidden');
        }
    } else {
        if (percent === 100) {
            titleEl.textContent = 'GOD SLAIN!';
        } else if (percent >= 60) {
            titleEl.textContent = 'DEMI GOD FELLED!';
        } else {
            titleEl.textContent = 'GREAT ENEMY FELLED!';
        }

        scoreEl.textContent = isRetestMode
            ? `Retest: ${score}/${total} (${percent}%)`
            : `Score: ${score}/${total} (${percent}%)`;

        if (mistakes.length === 0) {
            felledSound.play().catch(() => {});
            mistakesDiv.innerHTML = '<p>No mistakes — thou art unstoppable!</p>';
            retestBtn.classList.add('hidden');
        } else {
            itemSound.play().catch(() => {});
            mistakesDiv.innerHTML = '<h3>Mistakes to reforge:</h3><ul>' +
                mistakes.map(m => `<li>${m}</li>`).join('') +
                '</ul>';
            retestBtn.classList.remove('hidden');
        }
    }
}

function loadSavedLists() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const container = document.getElementById('saved-lists');
    container.innerHTML = '';
    if (!saved) {
        container.innerHTML = '<p>No crafting recipes yet — forge thy first!</p>';
        return;
    }
    const lists = JSON.parse(saved);
    Object.keys(lists).forEach(name => {
        const div = document.createElement('div');
        div.className = 'saved-list';
        div.innerHTML = `<span><strong>${name}</strong> (${lists[name].length} incantations)</span>`;
        const btns = document.createElement('div');
        btns.className = 'buttons';
        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load';
        loadBtn.className = 'primary';
        loadBtn.onclick = () => loadList(name);
        btns.appendChild(loadBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.className = 'delete';
        deleteBtn.onclick = () => {
            if (confirm(`Destroy crafting recipe "${name}" forever?`)) {
                deleteList(name);
            }
        };
        btns.appendChild(deleteBtn);
        div.appendChild(btns);
        container.appendChild(div);
    });
}

function loadList(name) {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved[name]) {
        document.getElementById('words-input').value = saved[name].join('\n');
        document.getElementById('list-name').value = name;
        document.getElementById('save-section').classList.remove('hidden');
        document.getElementById('list-name2').textContent = `${name} `;
    }
}

function saveList() {
    const name = document.getElementById('list-name').value.trim();
    if (!name) return alert('Name thy crafting recipe, Tarnished!');
    const currentWords = document.getElementById('words-input').value.trim().split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w);
    if (currentWords.length === 0) return alert('No incantations to inscribe!');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    saved[name] = currentWords;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    alert(`Crafting recipe "${name}" inscribed!`);
    loadSavedLists();
}

function deleteList(name) {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    delete saved[name];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    loadSavedLists();
}

function clearSavedLists() {
    localStorage.removeItem(STORAGE_KEY);
    loadSavedLists();
}

function resetMistakes() {
    mistakeCounts = {};
    localStorage.setItem(MISTAKE_KEY, JSON.stringify(mistakeCounts));
    alert('All sins forgiven. The demigods tremble once more...');
}

// ── Event Listeners ─────────────────────────────────────────────
document.getElementById('start-button').onclick = () => startGame(false);
document.getElementById('submit-button').onclick = checkAnswer;
document.getElementById('restart-button').onclick = () => {
    document.getElementById('input-section').classList.remove('hidden');
    document.getElementById('results-section').classList.add('hidden');
    if (synth) synth.cancel();
    };
document.getElementById('retest-button').onclick = () => {
    potionSound.currentTime = 0;
    potionSound.play().catch(() => {});
    startGame(true);
};
document.getElementById('speak-button').onclick = () => {
    hasUserInteracted = true;
    playAudioHint();
};
document.getElementById('save-button').onclick = saveList;
document.getElementById('boss-button').onclick = () => {
    bossStartSound.play().catch(() => {});
    startBossBattle();
}
document.getElementById('user-input').onkeyup = (e) => {
    if (e.key === 'Enter') {
        checkAnswer();
    }
};
document.getElementById('words-input').oninput = () => {
    if (document.getElementById('words-input').value.trim()) {
        document.getElementById('save-section').classList.remove('hidden');
    }
};
document.getElementById('auto-speak').onchange = (e) => {
    autoSpeakEnabled = e.target.checked;
};

loadSavedLists();