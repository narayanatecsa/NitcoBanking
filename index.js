const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const FLOW_ID = process.env.FLOW_ID;

const SHEET_API = "YOUR_GOOGLE_SCRIPT_API";

const leaveDB = new Map();

// ===== GET ALL USERS =====
async function getUsers() {
  const res = await axios.get(SHEET_API);
  return res.data;
}

// ===== GET USER BY PHONE =====
async function getUser(phone) {
  const users = await getUsers();
  const clean = phone.replace(/\D/g, "");

  return users.find(u =>
    String(u.Mobile).replace(/\D/g, "") === clean &&
    u.Status === "Active"
  );
}

// ===== GET MANAGER BY NAME =====
async function getManagerByName(name) {
  const users = await getUsers();
  return users.find(u => u.Name.toLowerCase() === name.toLowerCase());
}

// ===== VERIFY =====
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    // ===== FLOW SUBMIT =====
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {

      const data = msg.interactive.nfm_reply.response_json;

      const user = await getUser(from);
      if (!user) return res.sendStatus(200);

      // 🔥 GET MANAGER FROM NAME
      const manager = await getManagerByName(user.Reportee);

      if (!manager) {
        await sendText(pid, from, "❌ Manager not found");
        return res.sendStatus(200);
      }

      const leaveId = "L" + Date.now();

      const leave = {
        id: leaveId,
        empName: user.Name,
        empPhone: from,
        managerPhone: manager.Mobile,
        fromDate: data.from_date,
        toDate: data.to_date,
        reason: data.reason,
        status: "PENDING"
      };

      leaveDB.set(leaveId, leave);

      await sendText(pid, from,
`✅ Leave Applied
ID: ${leaveId}
Status: PENDING`);

      await sendApproval(pid, leave);

      return res.sendStatus(200);
    }

    // ===== BUTTON ACTION =====
    if (msg.type === "interactive" && msg.interactive?.button_reply) {

      const id = msg.interactive.button_reply.id;

      if (id.startsWith("ACTION_")) {

        const [_, action, leaveId] = id.split("_");
        const leave = leaveDB.get(leaveId);

        if (!leave) {
          await sendText(pid, from, "❌ Not found");
          return res.sendStatus(200);
        }

        // STEP 1 → IN PROGRESS
        if (action === "START") {
          leave.status = "IN PROGRESS";
          leaveDB.set(leaveId, leave);

          await sendText(pid, from, "🟡 Marked as IN PROGRESS");

          await sendButtons(pid, from,
            "Choose final action:",
            [
              btn(`ACTION_APPROVE_${leaveId}`, "Approve"),
              btn(`ACTION_REJECT_${leaveId}`, "Reject")
            ]
          );

          return res.sendStatus(200);
        }

        // FINAL ACTION
        if (action === "APPROVE") leave.status = "APPROVED";
        if (action === "REJECT") leave.status = "REJECTED";

        leaveDB.set(leaveId, leave);

        await sendText(pid, from, `✅ ${leave.status}`);

        await sendText(pid, leave.empPhone,
`📌 Leave Update
ID: ${leave.id}
Status: ${leave.status}`);

        return res.sendStatus(200);
      }
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log(e);
    return res.sendStatus(200);
  }
});

// ===== SEND TO MANAGER =====
async function sendApproval(pid, leave) {

  const text =
`📢 Leave Request

Employee: ${leave.empName}
From: ${leave.fromDate}
To: ${leave.toDate}
Reason: ${leave.reason}

ID: ${leave.id}`;

  await sendButtons(pid, leave.managerPhone, text, [
    btn(`ACTION_START_${leave.id}`, "Pending")
  ]);
}

// ===== SEND TEXT =====
async function sendText(pid, to, body) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    text: { body }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ===== BUTTON =====
function btn(id, title) {
  return { type: "reply", reply: { id, title } };
}

// ===== SEND BUTTONS =====
async function sendButtons(pid, to, text, buttons) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: { buttons }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

app.listen(3000, () => console.log("✅ BOT READY"));
