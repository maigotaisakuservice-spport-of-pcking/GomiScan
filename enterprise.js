// Firebase初期化（あなたのプロジェクト用に設定を書き換えてください）
const firebaseConfig = {
  apiKey: "AIzaSyCSLAUpLPnuFPqEvIbF7qcQBygHii6EigI",
  authDomain: "gomiscan-pcdaimaou.firebaseapp.com",
  projectId: "gomiscan-pcdaimaou",
  storageBucket: "gomiscan-pcdaimaou.firebasestorage.app",
  messagingSenderId: "802767868691",
  appId: "1:802767868691:web:000fea632524bce9a340e6"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// UI状態管理
let currentTenant = null;
let currentTenantName = '';
let loggedIn = false;

// ログイン処理（テナント名の有無チェック→2段階認証）
async function handleLogin() {
  const tenantName = document.getElementById("tenantName").value.trim();
  const tenantPass = document.getElementById("tenantPass").value.trim();
  if (tenantName.length < 1 || tenantPass.length !== 5) {
    return alert("テナント名と5桁の暗証番号を正しく入力してください");
  }

  const snap = await db.collection("tenants")
    .where("name", "==", tenantName)
    .where("password", "==", tenantPass)
    .get();

  if (snap.empty) {
    alert("テナント情報が見つかりません");
    return;
  }

  snap.forEach(doc => {
    currentTenant = doc.id;
    currentTenantName = doc.data().name;
    loggedIn = true;
  });

  document.getElementById("loginSection").style.display = "none";
  document.getElementById("verifySection").style.display = "block";
  document.getElementById("tenantNameLabel").innerText = currentTenantName;
}

// 2段階目：再パスワード確認
async function verifyPassword() {
  const verifyPass = document.getElementById("verifyPass").value.trim();
  const doc = await db.collection("tenants").doc(currentTenant).get();
  if (!doc.exists || doc.data().password !== verifyPass) {
    return alert("暗証番号が一致しません");
  }

  // メイン画面へ遷移
  document.getElementById("verifySection").style.display = "none";
  document.getElementById("mainApp").style.display = "block";
  loadTenantSettings();
}

// 新規テナント登録
async function registerTenant() {
  const name = document.getElementById("regTenantName").value.trim();
  const pass = document.getElementById("regTenantPass").value.trim();
  const teamWebhook = document.getElementById("regTenantWebhook").value.trim();

  if (name.length < 1 || pass.length !== 5) {
    return alert("テナント名と5桁のパスワードを正しく入力してください");
  }

  const snap = await db.collection("tenants")
    .where("name", "==", name).get();
  if (!snap.empty) return alert("このテナント名はすでに登録されています");

  await db.collection("tenants").add({
    name,
    password: pass,
    webhook: teamWebhook,
    created: new Date()
  });

  alert("テナント登録が完了しました！");
}

// テナント設定ロード（曜日・企業ゴミなど）
async function loadTenantSettings() {
  const doc = await db.collection("tenants").doc(currentTenant).get();
  const data = doc.data();
  document.getElementById("tenantHeader").innerText = `【${data.name}】設定ページ`;
  document.getElementById("currentDays").innerText =
    (data.days || []).join(" / ") || "なし";
  document.getElementById("customRules").innerText =
    data.rules || "ルール未登録";
}

// 曜日追加
async function addDay() {
  const newDay = document.getElementById("addDay").value;
  const docRef = db.collection("tenants").doc(currentTenant);
  const doc = await docRef.get();
  const days = doc.data().days || [];
  if (!days.includes(newDay)) days.push(newDay);
  await docRef.update({ days });
  alert("曜日を追加しました");
  loadTenantSettings();
}

// AI推論（画像→分類→ルール表示）
let model = null;
async function loadModel() {
  model = await tf.loadGraphModel(
    'https://tfhub.dev/google/tfjs-model/imagenet/mobilenet_v2_140_224/classification/4/default/1',
    { fromTFHub: true }
  );
}
loadModel();

document.getElementById("imgInput").addEventListener("change", handleImage, false);

async function handleImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = async () => {
    const tensor = tf.browser.fromPixels(img)
      .resizeNearestNeighbor([224, 224])
      .toFloat()
      .expandDims();
    const prediction = await model.predict(tensor).data();
    const top = prediction.indexOf(Math.max(...prediction));
    showPrediction(top);
  };
}

// 分類インデックスを仮マッピング
function showPrediction(index) {
  const category = getCategoryFromIndex(index);
  document.getElementById("predictionResult").innerText =
    `分類結果: ${category}`;
}

function getCategoryFromIndex(index) {
  if (index < 200) return "可燃ごみ";
  if (index < 400) return "不燃ごみ";
  if (index < 700) return "資源ごみ";
  return "その他";
}

// Teams通知送信
async function sendTeamsMessage() {
  const msg = prompt("Teamsに送信する内容を入力してください");
  if (!msg) return;
  const doc = await db.collection("tenants").doc(currentTenant).get();
  const webhook = doc.data().webhook;
  if (!webhook) return alert("Webhookが未設定です");

  await fetch(webhook, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `[GomiScan通知] ${msg}` })
  });
  alert("送信しました");
      }
