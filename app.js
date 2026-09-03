/**
 * app.js
 * 猟銃等初心者講習 考査対策アプリ - 画面制御・出題ロジック
 * サーバー通信は行わず、すべて端末内（questions.js のデータ + localStorage）で完結する。
 */

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------
function $(sel, root) {
  return (root || document).querySelector(sel);
}
function $$(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function formatDateJP(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
function formatDateTimeJP(isoString) {
  const d = new Date(isoString);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

let QUESTION_MAP = new Map();

// ---------------------------------------------------------------------------
// アプリ状態
// ---------------------------------------------------------------------------
const state = {
  quizSession: null,
  examSession: null,
};

// ---------------------------------------------------------------------------
// 画面切替
// ---------------------------------------------------------------------------
function showScreen(name) {
  $$(".screen").forEach((sec) => sec.classList.remove("active"));
  const target = document.querySelector(`[data-screen="${name}"]`);
  if (target) {
    target.classList.add("active");
    target.scrollTop = 0;
  }
  window.scrollTo(0, 0);
}

function goHome() {
  showScreen("home");
  renderHome();
}

// ---------------------------------------------------------------------------
// トースト通知
// ---------------------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => { el.hidden = true; }, 250);
  }, 2200);
}

// ---------------------------------------------------------------------------
// 確認ダイアログ（Promise版）
// ---------------------------------------------------------------------------
function confirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = $("#confirm-overlay");
    const msgEl = $("#confirm-message");
    const okBtn = $("#confirm-ok");
    const cancelBtn = $("#confirm-cancel");
    msgEl.textContent = message;
    overlay.hidden = false;
    function cleanup(result) {
      overlay.hidden = true;
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// ---------------------------------------------------------------------------
// テーマ
// ---------------------------------------------------------------------------
function applyTheme() {
  const theme = Storage.getTheme();
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

// ---------------------------------------------------------------------------
// 問題行（一覧・復習・お気に入りなどで共通利用）
// ---------------------------------------------------------------------------
function buildQuestionRow(q, opts) {
  opts = opts || {};
  const row = document.createElement("div");
  row.className = "question-row";

  const head = document.createElement("button");
  head.type = "button";
  head.className = "question-row-head";
  head.innerHTML =
    `<span class="q-id">Q${q.id}</span>` +
    `<span class="q-cat">${escapeHtml(q.category)}</span>` +
    `<span class="q-text">${escapeHtml(q.question)}</span>` +
    `<span class="q-chevron">▾</span>`;

  const body = document.createElement("div");
  body.className = "question-row-body";
  body.hidden = true;
  const answerText = q.answer ? "○（正しい）" : "×（誤り）";
  body.innerHTML =
    `<p class="q-answer ${q.answer ? "is-true" : "is-false"}">正解: ${answerText}</p>` +
    `<p class="q-explanation">${escapeHtml(q.explanation)}</p>` +
    `<p class="q-source">出典: ${escapeHtml(q.source)}</p>`;

  head.addEventListener("click", () => {
    body.hidden = !body.hidden;
    row.classList.toggle("expanded", !body.hidden);
  });

  row.appendChild(head);
  row.appendChild(body);

  if (opts.showFavorite) {
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "row-fav-btn";
    favBtn.setAttribute("aria-label", "お気に入り登録");
    const setIcon = () => {
      const fav = Storage.isFavorite(q.id);
      favBtn.textContent = fav ? "★" : "☆";
      favBtn.classList.toggle("active", fav);
    };
    setIcon();
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      Storage.toggleFavorite(q.id);
      setIcon();
    });
    row.appendChild(favBtn);
  }

  return row;
}

// ---------------------------------------------------------------------------
// カテゴリ別正答率バー（弱点克服・模試結果で共通利用）
// ---------------------------------------------------------------------------
function renderCategoryBarList(container, entries, opts) {
  opts = opts || {};
  container.innerHTML = "";
  if (entries.length === 0) {
    container.innerHTML = '<p class="help-text">データがありません。</p>';
    return;
  }
  entries.forEach((item) => {
    const clickable = !!opts.clickable;
    const el = document.createElement(clickable ? "button" : "div");
    if (clickable) el.type = "button";
    el.className = "category-bar-row" + (clickable ? " clickable" : "");
    const rateLabel = item.rate === null ? "未学習" : `${item.rate}%`;
    el.innerHTML =
      `<div class="category-bar-top"><span class="category-bar-name">${escapeHtml(item.category)}</span><span class="category-bar-rate">${rateLabel}</span></div>` +
      `<div class="category-bar-track"><div class="category-bar-fill" style="width:${item.rate || 0}%"></div></div>` +
      `<div class="category-bar-count">${item.total > 0 ? `${item.correct} / ${item.total} 問` : "まだ出題されていません"}</div>`;
    if (clickable && opts.onClick) {
      el.addEventListener("click", () => opts.onClick(item.category));
    }
    container.appendChild(el);
  });
}

function buildWeaknessEntries() {
  const stats = Storage.getCategoryStats();
  const withData = [];
  const noData = [];
  CATEGORIES.forEach((cat) => {
    const s = stats[cat];
    if (s && s.total > 0) {
      withData.push({ category: cat, correct: s.correct, total: s.total, rate: Math.round((s.correct / s.total) * 100) });
    } else {
      noData.push({ category: cat, correct: 0, total: 0, rate: null });
    }
  });
  withData.sort((a, b) => a.rate - b.rate);
  return withData.concat(noData);
}

// ---------------------------------------------------------------------------
// ホーム画面
// ---------------------------------------------------------------------------
function updateCountdown() {
  const examDateStr = Storage.getExamDate();
  const examDate = new Date(`${examDateStr}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((examDate - today) / 86400000);

  const numEl = $("#countdown-num");
  const unitEl = $(".countdown-unit");
  const labelEl = $("#countdown-label");
  const dateEl = $("#countdown-date");
  const changeBtn = $("#countdown-change-btn");
  const mm = examDate.getMonth() + 1;
  const dd = examDate.getDate();

  if (diffDays > 0) {
    labelEl.textContent = `${mm}月${dd}日の考査まであと`;
    numEl.textContent = diffDays;
    unitEl.textContent = "日";
    dateEl.textContent = formatDateJP(examDate);
    changeBtn.hidden = true;
  } else if (diffDays === 0) {
    labelEl.textContent = `${mm}月${dd}日は`;
    numEl.textContent = "考査当日";
    unitEl.textContent = "";
    dateEl.textContent = "頑張ってください！";
    changeBtn.hidden = true;
  } else {
    labelEl.textContent = `${mm}月${dd}日の考査は終了しました`;
    numEl.textContent = "";
    unitEl.textContent = "";
    dateEl.textContent = "次の考査日を設定できます";
    changeBtn.hidden = false;
  }
}

function renderHome() {
  updateCountdown();

  const reviewCount = Storage.getReviewTargetIds().length;
  $("#review-count-desc").textContent =
    reviewCount > 0 ? `苦手を優先出題（${reviewCount}問）` : "間違えた問題はまだありません";

  const history = Storage.getExamHistory();
  const card = $("#last-result-card");
  if (history.length === 0) {
    card.hidden = true;
  } else {
    const last = history[history.length - 1];
    card.hidden = false;
    $("#last-score").textContent = last.score;
    $("#last-rate").textContent = `正答率 ${last.rate}%`;
    const badge = $("#last-pass-badge");
    badge.textContent = last.pass ? "合格圏" : "もう一度復習";
    badge.className = "badge " + (last.pass ? "pass" : "fail");
  }
}

// ---------------------------------------------------------------------------
// クイズ共通エンジン（学習・10問クイック・間違い復習・弱点克服・お気に入り）
// ---------------------------------------------------------------------------
function startQuizSession(mode, questions, opts) {
  opts = opts || {};
  if (!questions || questions.length === 0) {
    showToast("出題できる問題がありません");
    return;
  }
  state.quizSession = {
    mode,
    queue: questions.slice(),
    index: 0,
    correctCount: 0,
    answeredCurrent: null,
    totalShown: 0,
  };
  showScreen("quiz");
  renderQuizQuestion();
}

function startQuizFromIds(ids, mode) {
  const questions = ids.map((id) => QUESTION_MAP.get(id)).filter(Boolean);
  startQuizSession(mode, questions);
}

function startStudyMode() {
  startQuizSession("study", shuffleArray(QUESTIONS));
}
function startQuickMode() {
  startQuizSession("quick", shuffleArray(QUESTIONS).slice(0, 10));
}
function startReviewMode() {
  const ids = Storage.getReviewTargetIds();
  if (ids.length === 0) {
    showToast("復習する問題はまだありません");
    return;
  }
  startQuizFromIds(ids, "review");
}
function startWeaknessMode(category) {
  const questions = shuffleArray(QUESTIONS.filter((q) => q.category === category));
  startQuizSession("weakness", questions, { categoryLabel: category });
}
function startFavoritesMode() {
  const ids = Storage.getFavorites();
  if (ids.length === 0) {
    showToast("お気に入りに登録した問題がありません");
    return;
  }
  startQuizFromIds(shuffleArray(ids), "favorites");
}

function progressLabel(session) {
  if (session.mode === "study") return `${session.totalShown}問目`;
  return `Q${session.index + 1} / ${session.queue.length}`;
}

function updateQuizFavButton(id) {
  const btn = $("#quiz-fav");
  const fav = Storage.isFavorite(id);
  btn.textContent = fav ? "★" : "☆";
  btn.classList.toggle("active", fav);
  btn.dataset.qid = id;
}

function renderQuizQuestion() {
  const session = state.quizSession;
  if (!session) return;

  if (session.index >= session.queue.length) {
    if (session.mode === "study") {
      session.queue = shuffleArray(QUESTIONS);
      session.index = 0;
      showToast("全問題を1周しました。続けて出題します。");
    } else {
      finishQuizSession();
      return;
    }
  }

  const q = session.queue[session.index];
  session.totalShown += 1;
  session.answeredCurrent = null;

  $("#quiz-progress").textContent = progressLabel(session);
  $("#quiz-category").textContent = q.category;
  $("#quiz-question").textContent = q.question;
  $("#quiz-feedback").hidden = true;
  $("#answer-buttons").hidden = false;
  $("#btn-next").hidden = true;
  updateQuizFavButton(q.id);
}

function answerQuiz(userAnswer) {
  const session = state.quizSession;
  if (!session || session.answeredCurrent !== null) return;
  const q = session.queue[session.index];
  const isCorrect = userAnswer === q.answer;
  session.answeredCurrent = isCorrect;
  if (isCorrect) session.correctCount += 1;
  Storage.recordAnswer(q.id, q.category, isCorrect);

  const badge = $("#feedback-badge");
  badge.textContent = isCorrect ? "○ 正解" : "× 不正解";
  badge.className = "feedback-badge " + (isCorrect ? "correct" : "incorrect");
  $("#quiz-explanation").textContent = q.explanation;
  $("#quiz-source").textContent = `出典: ${q.source}`;
  $("#quiz-feedback").hidden = false;
  $("#answer-buttons").hidden = true;
  $("#btn-next").hidden = false;
}

function finishQuizSession() {
  const session = state.quizSession;
  if (!session) return;
  const mode = session.mode;
  if (mode === "quick") {
    showQuickResult(session);
  } else if (mode === "review") {
    showToast("復習セッションが終了しました");
    showScreen("review-home");
    renderReviewHome();
  } else if (mode === "weakness") {
    showToast("学習が終わりました");
    showScreen("weakness-home");
    renderWeaknessHome();
  } else if (mode === "favorites") {
    showToast("お気に入り学習が終わりました");
    goHome();
  } else {
    goHome();
  }
  state.quizSession = null;
}

function handleQuizBack() {
  const session = state.quizSession;
  const mode = session ? session.mode : null;
  state.quizSession = null;
  if (mode === "review") {
    showScreen("review-home");
    renderReviewHome();
  } else if (mode === "weakness") {
    showScreen("weakness-home");
    renderWeaknessHome();
  } else {
    goHome();
  }
}

// ---------------------------------------------------------------------------
// 本番模試
// ---------------------------------------------------------------------------
function startExamMode() {
  const questions = shuffleArray(QUESTIONS).slice(0, 50);
  state.examSession = {
    questions,
    answers: new Array(questions.length).fill(null),
    index: 0,
  };
  showScreen("exam");
  renderExamQuestion();
}

function renderExamQuestion() {
  const s = state.examSession;
  if (!s) return;
  const q = s.questions[s.index];
  $("#exam-progress").textContent = `Q${s.index + 1} / ${s.questions.length}`;
  $("#exam-category").textContent = q.category;
  $("#exam-question").textContent = q.question;

  const ans = s.answers[s.index];
  const indicator = $("#exam-selected");
  if (ans === null) {
    indicator.textContent = "未回答";
    indicator.className = "exam-selected-indicator unanswered";
  } else {
    indicator.textContent = ans ? "現在の回答：○（正しい）" : "現在の回答：×（誤り）";
    indicator.className = "exam-selected-indicator answered";
  }
  $("#exam-btn-maru").classList.toggle("selected", ans === true);
  $("#exam-btn-batsu").classList.toggle("selected", ans === false);
  $("#exam-prev").disabled = s.index === 0;
  const isLast = s.index === s.questions.length - 1;
  $("#exam-next").textContent = isLast ? "回答状況を見る →" : "次の問題 →";
}

function selectExamAnswer(val) {
  const s = state.examSession;
  if (!s) return;
  s.answers[s.index] = val;
  renderExamQuestion();
  if (s.index < s.questions.length - 1) {
    setTimeout(() => {
      if (state.examSession === s) {
        s.index = Math.min(s.index + 1, s.questions.length - 1);
        renderExamQuestion();
      }
    }, 220);
  }
}

function examGoNext() {
  const s = state.examSession;
  if (!s) return;
  if (s.index === s.questions.length - 1) {
    openExamGrid();
  } else {
    s.index = Math.min(s.index + 1, s.questions.length - 1);
    renderExamQuestion();
  }
}
function examGoPrev() {
  const s = state.examSession;
  if (!s) return;
  s.index = Math.max(s.index - 1, 0);
  renderExamQuestion();
}

function renderExamGrid() {
  const s = state.examSession;
  const grid = $("#exam-number-grid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  s.questions.forEach((q, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const answered = s.answers[i] !== null;
    btn.className =
      "grid-num-btn" + (answered ? " answered" : " unanswered") + (i === s.index ? " current" : "");
    btn.textContent = i + 1;
    btn.addEventListener("click", () => {
      s.index = i;
      $("#exam-grid-overlay").hidden = true;
      renderExamQuestion();
    });
    frag.appendChild(btn);
  });
  grid.appendChild(frag);
}

function openExamGrid() {
  if (!state.examSession) return;
  renderExamGrid();
  $("#exam-grid-overlay").hidden = false;
}

async function handleExamSubmit() {
  const s = state.examSession;
  if (!s) return;
  const unanswered = s.answers.filter((a) => a === null).length;
  if (unanswered > 0) {
    const ok = await confirmDialog(
      `未回答が${unanswered}問あります。未回答は不正解として採点されます。採点しますか？`
    );
    if (!ok) return;
  }
  $("#exam-grid-overlay").hidden = true;
  scoreExam();
}

async function handleExamBack() {
  if (!state.examSession) {
    goHome();
    return;
  }
  const ok = await confirmDialog("模試を中断しますか？回答内容は保存されません。");
  if (ok) {
    state.examSession = null;
    goHome();
  }
}

function scoreExam() {
  const s = state.examSession;
  if (!s) return;
  let correct = 0;
  const wrongIds = [];
  const categoryStats = {};

  s.questions.forEach((q, i) => {
    const userAns = s.answers[i];
    const isCorrect = userAns !== null && userAns === q.answer;
    if (!categoryStats[q.category]) categoryStats[q.category] = { correct: 0, total: 0 };
    categoryStats[q.category].total += 1;
    if (isCorrect) {
      correct += 1;
      categoryStats[q.category].correct += 1;
    } else {
      wrongIds.push(q.id);
    }
    Storage.recordAnswer(q.id, q.category, isCorrect);
  });

  const total = s.questions.length;
  const rate = Math.round((correct / total) * 100);
  const pass = correct >= 45;
  const result = {
    date: new Date().toISOString(),
    score: correct,
    total,
    rate,
    pass,
    categoryStats,
    wrongIds,
  };
  Storage.addExamResult(result);
  state.examSession = null;
  showScreen("exam-result");
  renderExamResult(result);
}

function renderExamResult(result) {
  $("#result-score").textContent = result.score;
  $("#result-rate").textContent = `正答率 ${result.rate}%`;
  const badge = $("#result-pass-badge");
  badge.textContent = result.pass ? "合格圏" : "もう一度復習";
  badge.className = "result-pass-badge " + (result.pass ? "pass" : "fail");

  const entries = CATEGORIES.filter((c) => result.categoryStats[c]).map((c) => {
    const s = result.categoryStats[c];
    return { category: c, correct: s.correct, total: s.total, rate: Math.round((s.correct / s.total) * 100) };
  });
  entries.sort((a, b) => a.rate - b.rate);
  renderCategoryBarList($("#result-category-list"), entries, { clickable: true, onClick: startWeaknessMode });

  $("#result-wrong-count").textContent = result.wrongIds.length;
  const wrongContainer = $("#result-wrong-list");
  wrongContainer.innerHTML = "";
  if (result.wrongIds.length === 0) {
    wrongContainer.innerHTML = '<p class="help-text">全問正解でした。素晴らしいです。</p>';
  } else {
    result.wrongIds.forEach((id) => {
      const q = QUESTION_MAP.get(id);
      if (q) wrongContainer.appendChild(buildQuestionRow(q, { showFavorite: true }));
    });
  }

  state.lastExamResult = result;
}

// ---------------------------------------------------------------------------
// 10問クイック結果
// ---------------------------------------------------------------------------
function showQuickResult(session) {
  $("#quick-score").textContent = session.correctCount;
  const rate = Math.round((session.correctCount / session.queue.length) * 100);
  $("#quick-rate").textContent = `正答率 ${rate}%`;
  showScreen("quick-result");
}

// ---------------------------------------------------------------------------
// 間違い復習ホーム
// ---------------------------------------------------------------------------
function renderReviewHome() {
  const targetIds = Storage.getReviewTargetIds();
  const masteredIds = Storage.getMasteredIds();
  $("#review-target-count").textContent = targetIds.length;
  $("#review-mastered-count").textContent = masteredIds.length;

  const masteredContainer = $("#mastered-list");
  masteredContainer.innerHTML = "";
  if (masteredIds.length === 0) {
    masteredContainer.innerHTML = '<p class="help-text">まだ克服済みの問題はありません。</p>';
  } else {
    masteredIds.forEach((id) => {
      const q = QUESTION_MAP.get(id);
      if (q) masteredContainer.appendChild(buildQuestionRow(q, { showFavorite: true }));
    });
  }
}

// ---------------------------------------------------------------------------
// 弱点克服ホーム
// ---------------------------------------------------------------------------
function renderWeaknessHome() {
  const entries = buildWeaknessEntries();
  renderCategoryBarList($("#weakness-category-list"), entries, { clickable: true, onClick: startWeaknessMode });
}

// ---------------------------------------------------------------------------
// 成績画面
// ---------------------------------------------------------------------------
function renderStats() {
  const history = Storage.getExamHistory();
  if (history.length === 0) {
    ["stat-latest", "stat-best", "stat-avg", "stat-avg5", "stat-pass-count", "stat-total-count"].forEach((id) => {
      $("#" + id).textContent = "-";
    });
    $("#score-chart").innerHTML = "";
    $("#chart-empty").hidden = false;
    $("#exam-history-list").innerHTML = '<p class="help-text">まだ模試の記録がありません。</p>';
    return;
  }
  $("#chart-empty").hidden = true;

  const scores = history.map((h) => h.score);
  const latest = history[history.length - 1];
  $("#stat-latest").textContent = `${latest.score} / 50`;
  $("#stat-best").textContent = `${Math.max(...scores)} / 50`;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  $("#stat-avg").textContent = `${avg.toFixed(1)}点`;
  const last5 = scores.slice(-5);
  const avg5 = last5.reduce((a, b) => a + b, 0) / last5.length;
  $("#stat-avg5").textContent = `${avg5.toFixed(1)}点`;
  $("#stat-pass-count").textContent = `${history.filter((h) => h.pass).length}回`;
  $("#stat-total-count").textContent = `${history.length}回`;

  renderScoreChart(history.slice(-20));
  renderExamHistoryList(history);
}

function renderScoreChart(records) {
  const svg = $("#score-chart");
  const w = 320, h = 140, padX = 16, padY = 16;
  const n = records.length;
  const scoreToY = (score) => h - padY - (score / 50) * (h - padY * 2);
  const xAt = (i) => (n <= 1 ? w / 2 : padX + i * ((w - padX * 2) / (n - 1)));

  const pts = records.map((r, i) => `${xAt(i).toFixed(1)},${scoreToY(r.score).toFixed(1)}`).join(" ");
  const passY = scoreToY(45).toFixed(1);

  let content = `<line x1="0" y1="${passY}" x2="${w}" y2="${passY}" class="pass-line" />`;
  content += `<polyline points="${pts}" class="score-line" fill="none" />`;
  records.forEach((r, i) => {
    content += `<circle cx="${xAt(i).toFixed(1)}" cy="${scoreToY(r.score).toFixed(1)}" r="4" class="score-dot ${r.pass ? "pass" : "fail"}" />`;
  });
  svg.innerHTML = content;
}

function renderExamHistoryList(history) {
  const container = $("#exam-history-list");
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  history.slice().reverse().forEach((rec) => {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML =
      `<div class="history-row-top"><span>${formatDateTimeJP(rec.date)}</span><span class="history-score">${rec.score} / 50</span></div>` +
      `<div class="history-row-bottom"><span>正答率 ${rec.rate}%</span><span class="badge ${rec.pass ? "pass" : "fail"}">${rec.pass ? "合格圏" : "もう一度復習"}</span></div>`;
    frag.appendChild(row);
  });
  container.appendChild(frag);
}

// ---------------------------------------------------------------------------
// 問題一覧
// ---------------------------------------------------------------------------
function populateCategorySelect() {
  const sel = $("#list-category-filter");
  sel.innerHTML =
    '<option value="">すべてのカテゴリ</option>' +
    CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

function renderListItems() {
  const kw = $("#list-search").value.trim().toLowerCase();
  const cat = $("#list-category-filter").value;
  const container = $("#list-container");

  const filtered = QUESTIONS.filter((q) => {
    if (cat && q.category !== cat) return false;
    if (kw) {
      const hay = `${q.question} ${q.category} ${q.explanation}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  container.innerHTML = "";
  if (filtered.length === 0) {
    container.innerHTML = '<p class="help-text">該当する問題がありません。</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  filtered.forEach((q) => frag.appendChild(buildQuestionRow(q, { showFavorite: true })));
  container.appendChild(frag);
}

function renderList() {
  populateCategorySelect();
  $("#list-search").value = "";
  $("#list-category-filter").value = "";
  renderListItems();
}

// ---------------------------------------------------------------------------
// 設定画面
// ---------------------------------------------------------------------------
function renderSettings() {
  const theme = Storage.getTheme();
  $$("#theme-segmented .segment-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
  const examDate = Storage.getExamDate();
  $("#settings-exam-date").textContent = formatDateJP(new Date(`${examDate}T00:00:00`));
  $("#exam-date-input").value = examDate;
  $("#settings-question-count").textContent = QUESTIONS.length;
}

// ---------------------------------------------------------------------------
// イベント登録
// ---------------------------------------------------------------------------
function bindEvents() {
  $("#btn-settings").addEventListener("click", () => {
    showScreen("settings");
    renderSettings();
  });

  $(".menu-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-card");
    if (!btn) return;
    const nav = btn.dataset.nav;
    if (nav === "exam") startExamMode();
    else if (nav === "quick") startQuickMode();
    else if (nav === "study") startStudyMode();
    else if (nav === "review") { showScreen("review-home"); renderReviewHome(); }
    else if (nav === "weakness") { showScreen("weakness-home"); renderWeaknessHome(); }
    else if (nav === "stats") { showScreen("stats"); renderStats(); }
    else if (nav === "list") { showScreen("list"); renderList(); }
    else if (nav === "favorites") startFavoritesMode();
  });

  $("#countdown-change-btn").addEventListener("click", () => {
    showScreen("settings");
    renderSettings();
  });

  // クイズ共通
  $("#quiz-back").addEventListener("click", handleQuizBack);
  $("#btn-maru").addEventListener("click", () => answerQuiz(true));
  $("#btn-batsu").addEventListener("click", () => answerQuiz(false));
  $("#btn-next").addEventListener("click", () => {
    const session = state.quizSession;
    if (!session) return;
    session.index += 1;
    renderQuizQuestion();
  });
  $("#quiz-fav").addEventListener("click", () => {
    const id = Number($("#quiz-fav").dataset.qid);
    if (!id) return;
    Storage.toggleFavorite(id);
    updateQuizFavButton(id);
  });

  // 模試
  $("#exam-back").addEventListener("click", handleExamBack);
  $("#exam-btn-maru").addEventListener("click", () => selectExamAnswer(true));
  $("#exam-btn-batsu").addEventListener("click", () => selectExamAnswer(false));
  $("#exam-prev").addEventListener("click", examGoPrev);
  $("#exam-next").addEventListener("click", examGoNext);
  $("#exam-grid-btn").addEventListener("click", openExamGrid);
  $("#exam-grid-close").addEventListener("click", () => { $("#exam-grid-overlay").hidden = true; });
  $("#exam-submit-btn").addEventListener("click", handleExamSubmit);

  // 模試結果
  $("#exam-result-home").addEventListener("click", goHome);
  $("#result-home-btn").addEventListener("click", goHome);
  $("#result-retry").addEventListener("click", startExamMode);
  $("#result-review-wrong").addEventListener("click", () => {
    const result = state.lastExamResult;
    if (!result || result.wrongIds.length === 0) {
      showToast("間違えた問題はありません");
      return;
    }
    startQuizFromIds(result.wrongIds, "review");
  });

  // 10問クイック結果
  $("#quick-retry").addEventListener("click", startQuickMode);
  $("#quick-home-btn").addEventListener("click", goHome);

  // 間違い復習
  $("#review-home-back").addEventListener("click", goHome);
  $("#review-start-btn").addEventListener("click", startReviewMode);

  // 弱点克服
  $("#weakness-home-back").addEventListener("click", goHome);

  // 成績
  $("#stats-back").addEventListener("click", goHome);

  // 問題一覧
  $("#list-back").addEventListener("click", goHome);
  $("#list-search").addEventListener("input", renderListItems);
  $("#list-category-filter").addEventListener("change", renderListItems);

  // 設定
  $("#settings-back").addEventListener("click", goHome);
  $("#theme-segmented").addEventListener("click", (e) => {
    const btn = e.target.closest(".segment-btn");
    if (!btn) return;
    Storage.setTheme(btn.dataset.theme);
    applyTheme();
    renderSettings();
  });
  $("#exam-date-save").addEventListener("click", () => {
    const val = $("#exam-date-input").value;
    if (!val) {
      showToast("日付を選択してください");
      return;
    }
    Storage.setExamDate(val);
    showToast("考査日を変更しました");
    renderSettings();
  });
  $("#reset-data-btn").addEventListener("click", async () => {
    const ok1 = await confirmDialog(
      "本当にすべての学習データを削除しますか？模試履歴・間違えた問題・お気に入り・成績がすべて削除されます。"
    );
    if (!ok1) return;
    const ok2 = await confirmDialog("この操作は取り消せません。本当に削除してよろしいですか？");
    if (!ok2) return;
    Storage.resetAll();
    showToast("学習データを削除しました");
    renderSettings();
  });
}

// ---------------------------------------------------------------------------
// Service Worker 登録
// ---------------------------------------------------------------------------
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------
function init() {
  QUESTION_MAP = new Map(QUESTIONS.map((q) => [q.id, q]));
  applyTheme();
  bindEvents();
  renderHome();
  showScreen("home");
  registerServiceWorker();
}

init();
