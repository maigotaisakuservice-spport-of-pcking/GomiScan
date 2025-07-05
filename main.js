// main.js
'use strict';

let model = null;
let imageDataURL = null;
let quizEnabled = false;

// 郵便番号からのごみ分別ルール（超簡易版）
const regionRules = {
  "1000001": { name: "千代田区", rules: {
    "紙類": "毎週水曜 資源ごみ",
    "プラ類": "毎週月曜 燃えないごみ",
    "缶・金属": "毎月第1金曜 資源ごみ回収",
    "ビン・ガラス": "毎月第2金曜 資源ごみ回収",
    "電池・危険物": "市役所回収ボックスへ",
    "燃えるごみ": "週2回 月・木 燃えるごみ",
    "その他": "指定処理場へ持ち込み"
  }},
  "1500001": { name: "渋谷区", rules: {
    "紙類": "毎週火曜 資源ごみ",
    "プラ類": "毎週木曜 燃えないごみ",
    "缶・金属": "第1水曜 資源ごみ回収",
    "ビン・ガラス": "第3金曜 資源ごみ回収",
    "電池・危険物": "リサイクルセンター持ち込み",
    "燃えるごみ": "週3回 月・水・金 燃えるごみ",
    "その他": "区指定処理場へ"
  }},
  // 他の郵便番号も必要に応じて追加
};

// MobileNetの1000クラスとゴミ分類簡易マッピング
// （例なので正確な判定は限定的）
const mobilenetToGomiCategory = {
  "paper towel": "紙類",
  "envelope": "紙類",
  "packet": "プラ類",
  "plastic bag": "プラ類",
  "tin can": "缶・金属",
  "beer bottle": "ビン・ガラス",
  "bottlecap": "ビン・ガラス",
  "laptop": "その他",
  "lighter": "電池・危険物",
  "battery": "電池・危険物",
  "banana": "燃えるごみ",
  "apple": "燃えるごみ",
  "orange": "燃えるごみ",
  // ここに必要な単語を適宜追加してください
};

// Onsen UI elements
const fileInput = document.getElementById("fileInput");
const btnSelectImage = document.getElementById("btnSelectImage");
const btnAnalyze = document.getElementById("btnAnalyze");
const zipcodeInput = document.getElementById("zipcode");
const previewCanvas = document.getElementById("previewCanvas");
const ctx = previewCanvas.getContext("2d");
const resultArea = document.getElementById("resultArea");

const settingsDialog = document.getElementById("settingsDialog");
const btnSettings = document.getElementById("btnSettings");
const btnCloseSettings = document.getElementById("btnCloseSettings");
const quizSwitch = document.getElementById("quizSwitch");

// ローカルストレージキー
const STORAGE_KEY_QUIZ = "gomiScan_quiz_enabled";
const STORAGE_KEY_ZIP = "gomiScan_zipcode";

// --- 初期化 ---
window.onload = async () => {
  // 設定読み込み
  quizEnabled = localStorage.getItem(STORAGE_KEY_QUIZ) === "true";
  quizSwitch.checked = quizEnabled;

  const savedZip = localStorage.getItem(STORAGE_KEY_ZIP);
  if (savedZip) zipcodeInput.value = savedZip;

  btnAnalyze.disabled = true;
  previewCanvas.style.display = "none";

  // MobileNetモデル読み込み
  resultArea.textContent = "モデルを読み込み中...";
  model = await mobilenet.load();
  resultArea.textContent = "モデル読み込み完了。写真を選択してください。";

  attachEventListeners();
};

function attachEventListeners() {
  btnSelectImage.onclick = () => fileInput.click();
  fileInput.onchange = handleFileSelect;
  btnAnalyze.onclick = analyzeImage;

  btnSettings.onclick = () => settingsDialog.show();
  btnCloseSettings.onclick = () => settingsDialog.hide();

  quizSwitch.addEventListener("change", () => {
    quizEnabled = quizSwitch.checked;
    localStorage.setItem(STORAGE_KEY_QUIZ, quizEnabled ? "true" : "false");
  });

  zipcodeInput.addEventListener("input", () => {
    localStorage.setItem(STORAGE_KEY_ZIP, zipcodeInput.value);
  });
}

// --- 画像選択処理 ---
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    imageDataURL = e.target.result;
    const img = new Image();
    img.onload = () => {
      // キャンバスにリサイズして描画（最大300px幅）
      const maxWidth = 300;
      let scale = maxWidth / img.width;
      if (scale > 1) scale = 1;
      previewCanvas.width = img.width * scale;
      previewCanvas.height = img.height * scale;
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      ctx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
      previewCanvas.style.display = "block";
      btnAnalyze.disabled = false;
      resultArea.textContent = "準備完了。判定ボタンを押してください。";
    };
    img.src = imageDataURL;
  };
  reader.readAsDataURL(file);
}

// --- 画像解析 ---
async function analyzeImage() {
  if (!imageDataURL) {
    ons.notification.alert("画像を選択してください。");
    return;
  }

  resultArea.textContent = "解析中...";
  btnAnalyze.disabled = true;

  // 画像をImageオブジェクトに変換
  const img = new Image();
  img.src = imageDataURL;
  await img.decode();

  // MobileNetで分類
  const predictions = await model.classify(img);

  // 最良予測ラベルを取り出す
  let detectedLabel = null;
  for (const pred of predictions) {
    if (mobilenetToGomiCategory[pred.className]) {
      detectedLabel = pred.className;
      break;
    }
  }
  if (!detectedLabel) {
    detectedLabel = predictions[0].className; // 未分類も含む
  }

  const gomiCategory = mobilenetToGomiCategory[detectedLabel] || "その他";

  // 郵便番号から地域ルールを取得
  const zipcode = zipcodeInput.value.trim();
  const region = regionRules[zipcode];
  let regionName = "不明な地域";
  let ruleInfo = "郵便番号が未登録のため、分別ルールは表示できません。";

  if (region) {
    regionName = region.name;
    ruleInfo = region.rules[gomiCategory] || "この種類のごみのルールは登録されていません。";
  }

  // 結果表示
  let text = "";
  text += `地域: ${regionName}\n`;
  text += `検出ゴミ種類: ${detectedLabel}\n`;
  text += `分別カテゴリ: ${gomiCategory}\n`;
  text += `分別ルール: ${ruleInfo}\n`;

  if (quizEnabled) {
    text += "\n=== クイズモード ===\n";
    text += generateQuizText(gomiCategory);
  }

  resultArea.textContent = text;
  btnAnalyze.disabled = false;
}

// --- クイズテキスト生成（簡易） ---
function generateQuizText(correctCategory) {
  const categories = ["紙類", "プラ類", "缶・金属", "ビン・ガラス", "電池・危険物", "燃えるごみ", "その他"];
  // 4択クイズ作成
  let options = [correctCategory];
  while (options.length < 4) {
    const c = categories[Math.floor(Math.random() * categories.length)];
    if (!options.includes(c)) options.push(c);
  }
  // シャッフル
  options = options.sort(() => Math.random() - 0.5);

  let quizText = "このごみは何ごみでしょう？\n";
  options.forEach((opt, i) => {
    quizText += `${i + 1}. ${opt}\n`;
  });
  quizText += `\n正解は ${correctCategory} です！\n`;

  return quizText;
}
