const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const FLOW_ID = process.env.FLOW_ID;

const LOGO = "https://poojalist.com/Images/NewHRplace.png";

const SHEET_API = "https://script.google.com/macros/s/AKfycbwHHurrj6O-2w2543YxICZd_7G71MZ148NGEuNCYjrJXNWRO60JADwPREQ4yGHBGWVfVQ/exec?sheet=Emp_Details";

const userState = new Map();
const leaveDB = new Map();

const delay = (ms) => new Promise(r => setTimeout(r, ms));


// ===== GET USER =====
async function getUser(phone) {
  try {
    const res = await axios.get(SHEET_API);
    const users = res.data;

    const clean = phone.replace(/\D/g, "");

    return users.find(u =>
      String(u.Mobile).replace(/\D/g, "") === clean &&
      u.Status === "Active"
    ) || null;

  } catch (err) {
    console.log("Sheet error:", err.message);
    return null;
  }
}


// ===== GET MANAGER =====
async function getManagerByName(name) {
  try {
    const res = await axios.get(SHEET_API);
    const users = res.data;

    return users.find(u =>
      u.Name.toLowerCase() === name.toLowerCase()
    );
  } catch {
    return null;
  }
}


// ===== VERIFY =====
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});


// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    if (change.statuses) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    if (msg.id && userState.has(msg.id)) return res.sendStatus(200);
    userState.set(msg.id, true);


    // ================== ✅ LEAVE FLOW FIX ==================
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {

      let raw = msg.interactive.nfm_reply.response_json;

      // FIX JSON STRING
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch (e) {
          console.log("Parse error:", e);
        }
      }

      const data = raw?.data || raw;

      const clean = (v) =>
        v ? String(v).replace(/\$\{|\}/g, "") : "Not provided";

      const user = await getUser(from);
      if (!user) return res.sendStatus(200);

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
        leaveType: clean(data.leave_type),
        duration: clean(data.duration),
        fromDate: clean(data.from_date),
        toDate: clean(data.to_date),
        reason: clean(data.reason),
        status: "PENDING"
      };

      leaveDB.set(leaveId, leave);

      await sendText(pid, from,
`✅ Leave Applied
ID: ${leaveId}
Status: PENDING`);

      // FIX MANAGER NUMBER
      let m = String(manager.Mobile).replace(/\D/g, "");
      if (!m.startsWith("91")) m = "91" + m;

      await sendButtons(pid, m,
`📢 Leave Request

Employee: ${leave.empName}
Type: ${leave.leaveType}
Duration: ${leave.duration}
From: ${leave.fromDate}
To: ${leave.toDate}
Reason: ${leave.reason}

ID: ${leave.id}`,
[
        btn(`START_${leaveId}`, "Pending")
      ]);

      return res.sendStatus(200);
    }


    // ================== TEXT ==================
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase();

      if (text === "hi" || text === "hello") {

        const user = await getUser(from);
        if (!user) {
          await sendText(pid, from, "❌ Not registered");
          return res.sendStatus(200);
        }

        await sendImage(pid, from, LOGO);
        await delay(800);

        await sendText(pid, from,
`Hello ${user.Name}
Welcome to HRPlace 👋`);

        await menuFirst(pid, from);
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }


    // ================== BUTTON ==================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id.startsWith("START_")) {
        const leaveId = id.split("_")[1];
        const leave = leaveDB.get(leaveId);

        if (!leave) return res.sendStatus(200);

        await sendText(pid, from, "🟡 Status: IN PROGRESS");

        await sendButtons(pid, from,
          "Choose action:",
          [
            btn(`APPROVE_${leaveId}`, "Approve"),
            btn(`REJECT_${leaveId}`, "Reject")
          ]
        );

        return res.sendStatus(200);
      }

      if (id.startsWith("APPROVE_") || id.startsWith("REJECT_")) {

        const [action, leaveId] = id.split("_");
        const leave = leaveDB.get(leaveId);

        if (!leave) return res.sendStatus(200);

        leave.status = action === "APPROVE" ? "APPROVED" : "REJECTED";

        await sendText(pid, from, `✅ ${leave.status}`);

        await sendText(pid, leave.empPhone,
`📌 Leave Update
ID: ${leave.id}
Status: ${leave.status}`);

        return res.sendStatus(200);
      }

      if (id === "LEAVE") return sendFlow(pid, from);
      if (id === "LEAVE_MENU") return menuLeave(pid, from);
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log("ERROR:", e);
    return res.sendStatus(200);
  }
});


// ===== SEND =====
async function sendText(pid, to, body) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    text: { body }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

async function sendImage(pid, to, url) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link: url }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

async function sendFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: "Apply Leave" },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_id: FLOW_ID,
          flow_cta: "Open"
        }
      }
    }
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

function btn(id, title) {
  return { type: "reply", reply: { id, title } };
}

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


// ===== MENUS =====
async function menuFirst(pid, to) {
  return sendButtons(pid, to,
"Main Services",
[
  btn("LEAVE_MENU", "Leave & Attendance"),
  btn("CLAIM", "Claims"),
  btn("PAYROLL", "Payroll")
]);
}

async function menuSecond(pid, to) {
  return sendButtons(pid, to,
"More options",
[
  btn("POLICY", "Policies"),
  btn("CONTACT", "Contact HR")
]);
}

async function menuLeave(pid, to) {
  return sendButtons(pid, to,
"Leave Options",
[
  btn("LEAVE", "Apply Leave"),
  btn("BALANCE", "Leave Balance"),
  btn("BACK_MAIN", "Back")
]);
}


// ===== START =====
app.listen(3000, () => console.log("✅ HR BOT READY"));
