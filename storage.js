/**
 * storage.js
 * 端末内（localStorage）へのデータ保存を担当するモジュール。
 * サーバーへの通信は一切行わない。
 */

const Storage = (() => {
  const KEYS = {
    examDate: "rj_exam_date",
    theme: "rj_theme",
    favorites: "rj_favorites",
    wrongBank: "rj_wrong_bank",
    categoryStats: "rj_category_stats",
    examHistory: "rj_exam_history",
  };

  const DEFAULT_EXAM_DATE = "2026-09-18";
  const MAX_EXAM_HISTORY = 50;

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("localStorage read failed", e);
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn("localStorage write failed", e);
      return false;
    }
  }

  function readJSON(key, fallback) {
    const raw = safeGet(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    return safeSet(key, JSON.stringify(value));
  }

  // ---------------- 考査日 ----------------
  function getExamDate() {
    return safeGet(KEYS.examDate) || DEFAULT_EXAM_DATE;
  }
  function setExamDate(dateStr) {
    safeSet(KEYS.examDate, dateStr);
  }

  // ---------------- テーマ ----------------
  function getTheme() {
    return safeGet(KEYS.theme) || "system";
  }
  function setTheme(theme) {
    safeSet(KEYS.theme, theme);
  }

  // ---------------- お気に入り ----------------
  function getFavorites() {
    return readJSON(KEYS.favorites, []);
  }
  function isFavorite(id) {
    return getFavorites().includes(id);
  }
  function toggleFavorite(id) {
    const favs = getFavorites();
    const idx = favs.indexOf(id);
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.push(id);
    }
    writeJSON(KEYS.favorites, favs);
    return favs.includes(id);
  }

  // ---------------- 間違い問題バンク ----------------
  // { [id]: { wrongCount, correctStreak, totalCorrect, totalAttempts, lastWrongAt, mastered } }
  function getWrongBank() {
    return readJSON(KEYS.wrongBank, {});
  }
  function saveWrongBank(bank) {
    writeJSON(KEYS.wrongBank, bank);
  }

  // ---------------- カテゴリ別成績 ----------------
  // { [category]: { correct, total } }
  function getCategoryStats() {
    return readJSON(KEYS.categoryStats, {});
  }
  function saveCategoryStats(stats) {
    writeJSON(KEYS.categoryStats, stats);
  }

  /**
   * 1問回答したときの記録。学習/クイック/復習/弱点/模試すべてのモードから呼び出す共通処理。
   */
  function recordAnswer(questionId, category, isCorrect) {
    // カテゴリ別成績
    const catStats = getCategoryStats();
    if (!catStats[category]) catStats[category] = { correct: 0, total: 0 };
    catStats[category].total += 1;
    if (isCorrect) catStats[category].correct += 1;
    saveCategoryStats(catStats);

    // 間違い問題バンク
    const bank = getWrongBank();
    const key = String(questionId);
    if (!bank[key]) {
      bank[key] = {
        wrongCount: 0,
        correctStreak: 0,
        totalCorrect: 0,
        totalAttempts: 0,
        lastWrongAt: null,
        mastered: false,
      };
    }
    const entry = bank[key];
    entry.totalAttempts += 1;
    if (isCorrect) {
      entry.totalCorrect += 1;
      entry.correctStreak += 1;
      if (entry.wrongCount > 0 && entry.correctStreak >= 3) {
        entry.mastered = true;
      }
    } else {
      entry.wrongCount += 1;
      entry.correctStreak = 0;
      entry.lastWrongAt = new Date().toISOString();
      entry.mastered = false;
    }
    saveWrongBank(bank);
  }

  /** 間違い復習の対象（克服済みを除く、間違えたことがある問題） */
  function getReviewTargetIds() {
    const bank = getWrongBank();
    return Object.keys(bank)
      .filter((id) => bank[id].wrongCount > 0 && !bank[id].mastered)
      .map((id) => Number(id))
      .sort((a, b) => bank[String(b)].wrongCount - bank[String(a)].wrongCount);
  }

  function getMasteredIds() {
    const bank = getWrongBank();
    return Object.keys(bank)
      .filter((id) => bank[id].mastered)
      .map((id) => Number(id));
  }

  // ---------------- 模試履歴 ----------------
  function getExamHistory() {
    return readJSON(KEYS.examHistory, []);
  }
  function addExamResult(result) {
    const history = getExamHistory();
    history.push(result);
    // 直近が末尾。上限を超えたら古いものから削除。
    while (history.length > MAX_EXAM_HISTORY) {
      history.shift();
    }
    writeJSON(KEYS.examHistory, history);
  }

  // ---------------- 全データ削除 ----------------
  function resetAll() {
    Object.values(KEYS).forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (e) {
        /* noop */
      }
    });
  }

  return {
    getExamDate,
    setExamDate,
    getTheme,
    setTheme,
    getFavorites,
    isFavorite,
    toggleFavorite,
    getWrongBank,
    getCategoryStats,
    recordAnswer,
    getReviewTargetIds,
    getMasteredIds,
    getExamHistory,
    addExamResult,
    resetAll,
    DEFAULT_EXAM_DATE,
  };
})();
