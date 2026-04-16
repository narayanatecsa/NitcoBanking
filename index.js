const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const FLOW_ID = process.env.FLOW_ID;

const LOGO = "https://poojalist.com/Images/NewHRplace.png";

// ✅ MYSQL CONNECTION
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const userState = new Map();
const leaveDB = new Map();

const delay = (ms) => new Promise(r => setTimeout(r, ms));


// ================== ✅ GET USER (FIXED MOBILE) ==================
async function getUser(phone) {
  try {
    let clean = phone.replace(/\D/g, "");
    const last10 = clean.slice(-10);

    console.log("Incoming:", phone);
    console.log("Last10:", last10);

    const [rows] = await db.execute(
      `SELECT * FROM employees 
       WHERE mobile LIKE ? 
       AND status='Active'`,
      [`%${last10}`]
    );

    console.log("Matched:", rows);

    return rows[0] || null;

  } catch (err) {
    console.log("DB FULL ERROR:", err); // 👈 important
    return null;
  }
}
// ================== ✅ GET MANAGER BY NAME ==================
async function getManagerByName(name) {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM employees WHERE LOWER(name) = LOWER(?)",
      [name]
    );

    return rows[0] || null;

  } catch (e) {
    return null;
  }
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

    if (change.statuses) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    console.log("Incoming:", from);

    // Prevent duplicate messages
    if (msg.id) {
      if (userState.has(msg.id)) return res.sendStatus(200);
      userState.set(msg.id, true);
    }


    // ================== LEAVE FLOW ==================
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {

      const data = msg.interactive.nfm_reply.response_json;

      const user = await getUser(from);
      if (!user) return res.sendStatus(200);

      const manager = await getManagerByName(user.reportee);

      if (!manager) {
        await sendText(pid, from, "❌ Manager not found");
        return res.sendStatus(200);
      }

      const leaveId = "L" + Date.now();

      const leave = {
        id: leaveId,
        empName: user.name,
        empPhone: from,
        managerPhone: manager.mobile,
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

      await sendButtons(pid, manager.mobile,
`📢 Leave Request

Employee: ${leave.empName}
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
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        const user = await getUser(from);

        if (!user) {
          await sendText(pid, from, "❌ You are not registered. Please contact HR.");
          return res.sendStatus(200);
        }

        const firstKey = from + "_FIRST";

        await sendImage(pid, from, LOGO);
        await delay(800);

        if (!userState.has(firstKey)) {
          userState.set(firstKey, true);

          await sendText(pid, from,
`Hello ${user.name}

Welcome to HRPlace 👋
Please choose a service below.`);
          await delay(800);
        }

        await menuFirst(pid, from);
        await delay(600);
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }


    // ================== BUTTON HANDLER ==================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      // (keep your existing logic unchanged)

      if (id === "LEAVE_MENU") return menuLeave(pid, from).then(()=>res.sendStatus(200));
      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));

      if (id === "CLAIM") return sendText(pid, from, "Claims module").then(()=>res.sendStatus(200));
      if (id === "PAYROLL") return sendText(pid, from, "Payroll module").then(()=>res.sendStatus(200));

      if (id === "POLICY") return sendText(pid, from, "Company policies").then(()=>res.sendStatus(200));
      if (id === "CONTACT") return sendText(pid, from, "HR Contact").then(()=>res.sendStatus(200));

      if (id === "BACK_MAIN") {
        await menuFirst(pid, from);
        await delay(600);
        return menuSecond(pid, from).then(()=>res.sendStatus(200));
      }
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log("ERROR:", e);
    return res.sendStatus(200);
  }
});


// ===== SEND FUNCTIONS =====
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


// ===== FLOW =====
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


// ===== BUTTON UTILS =====
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
` *Main Services*`,
  [
    btn("LEAVE_MENU", "Leave & Attendance"),
    btn("CLAIM", "Claims"),
    btn("PAYROLL", "Payroll")
  ]);
}

async function menuSecond(pid, to) {
  return sendButtons(pid, to,
`More options:`,
  [
    btn("POLICY", "Policies"),
    btn("CONTACT", "Contact HR")
  ]);
}


// ===== LEAVE MENU =====
async function menuLeave(pid, to) {

  await sendButtons(pid, to,
` *Leave & Attendance*

Select an action:`,
  [
    btn("LEAVE", "Apply Leave"),
    btn("BALANCE", "Leave Balance"),
    btn("EDIT", "Edit/Cancel")
  ]);

  await delay(600);

  return sendButtons(pid, to,
`More actions:`,
  [
    btn("ATTENDANCE", "View Attendance"),
    btn("REGULARIZE", "Regularize"),
    btn("BACK_MAIN", "⬅ Back")
  ]);
}

app.listen(3000, () => console.log("✅ HR BOT MYSQL READY"));
