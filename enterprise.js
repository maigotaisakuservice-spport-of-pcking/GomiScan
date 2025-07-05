// Firebase初期化（無料プラン用）
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// グローバル状態
let tenantId = null;
let tenantData = null;

// ログイン処理（PIN認証）
async function loginTenant() {
  const pin = document.getElementById("tenantCode").value.trim();
  if (pin.length !== 5) {
    return (document.getElementById("loginError").textContent = "5桁の番号を入力してください");
  }

  const snap = await db.collection("tenants").where("pin", "==", pin).get();
  if (snap.empty) {
    document.getElementById("loginError").textContent = "認証失敗（登録されていません）";
    return;
  }

  const doc = snap.docs[0];
  tenantId = doc.id;
  tenantData = doc.data();
  document.querySelector("#tenantTitle").innerText = tenantData.name;
  document.querySelector("#appNavigator").pushPage("main.html");
}

// 登録処理
async function registerTenant() {
  const name = document.getElementById("regTenantName").value.trim();
  const pin = document.getElementById("regPin").value.trim();
  const contact = document.getElementById("regContact").value.trim();
  const webhook = document.getElementById("regWebhook").value.trim();
  const isEnterprise = document.getElementById("regIsEnterprise").checked;

  if (pin.length !== 5 || name === "") {
    return (document.getElementById("registerError").textContent = "入力内容を確認してください");
  }

  const dupCheck = await db.collection("tenants").where("pin", "==", pin).get();
  if (!dupCheck.empty) {
    return (document.getElementById("registerError").textContent = "このPINは既に使われています");
  }

  const newDoc = await db.collection("tenants").add({
    name,
    pin,
    contact,
    webhook,
    isEnterprise,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  alert("登録完了しました。ログインしてください");
  document.querySelector("#appNavigator").popPage();
}

// ログアウト
function logout() {
  tenantId = null;
  tenantData = null;
  document.querySelector("#appNavigator").popPage();
}

// 画像AI判別
async function analyzeImage() {
  const input = document.getElementById("imageInput");
  const resultEl = document.getElementById("scanResult");

  if (!input.files[0]) return (resultEl.textContent = "画像が選択されていません");

  resultEl.textContent = "判別中...";

  const reader = new FileReader();
  reader.onload = async function () {
    const img = new Image();
    img.src = reader.result;

    img.onload = async () => {
      const model = await mobilenet.load();
      const prediction = await model.classify(img);
      const top = prediction[0];
      resultEl.textContent = `判別結果: ${top.className}（確率: ${(top.probability * 100).toFixed(2)}%）`;

      // Firestoreに記録（履歴用）
      await db.collection("logs").add({
        tenantId,
        result: top.className,
        prob: top.probability,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Teams通知
      if (tenantData.webhook && tenantData.webhook.startsWith("https://")) {
        sendToTeams(`🧾 ごみ分類結果: ${top.className}\n確率 ${(top.probability * 100).toFixed(1)}%`);
      }
    };
  };
  reader.readAsDataURL(input.files[0]);
}

// Teams通知
function sendTeamsMessage() {
  if (!tenantData?.webhook || !tenantData.webhook.startsWith("https://")) {
    return alert("Webhook URLが登録されていません");
  }
  const msg = `🔔 テスト通知\n${new Date().toLocaleString()}`;
  sendToTeams(msg);
}

function sendToTeams(msg) {
  fetch(tenantData.webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: msg }),
  });
}

// カスタムスケジュール追加（簡易）
async function addCustomDay() {
  const day = prompt("追加する曜日名を入力してください（例: 第1木曜）");
  if (!day) return;
  await db.collection("schedule").add({
    tenantId,
    day,
    addedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  alert("追加しました");
}
