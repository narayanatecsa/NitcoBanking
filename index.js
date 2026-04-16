const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// ===== ENV =====
const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const FLOW_ID = process.env.FLOW_ID;

const LOGO = "https://poojalist.com/Images/NewHRplace.png";

// ===== MYSQL =====
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const userState = new Map();
const leaveDB = new Map();

const delay = (ms) => new Promise(r => setTimeout(r, ms));


// ================== ✅ GET USER (FIXED MOBILE ISSUE) ==================
async function getUser(phone) {
  try {
    let clean = phone.replace(/\D/g, "");

    let alt = clean;
    if (clean.startsWith("91")) {
      alt = clean.substring(2);
    } else {
      alt = "91" + clean;
    }

    const [rows] = await db.execute(
      "SELECT * FROM employees WHERE (mobile = ? OR mobile = ?) AND status='Active'",
      [clean, alt]
    );

    return rows[0] || null;

  } catch (err) {
    console.log("DB error:", err.message);
    return null;
  }
}


// ================== ✅ GET MANAGER ==================
async function getManager(manager_id) {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM employees WHERE emp_id = ?",
      [manager_id]
    );
    return rows[0] || null;
  } catch {
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

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    console.log("Incoming:", from);

    // ================== LEAVE FLOW ==================
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {

      const data = msg.interactive.nfm_reply.response_json;
      const user = await getUser(from);

      if (!user) return res.sendStatus(200);

      const manager = await getManager(user.manager_id);

      if (!manager) {
        await sendText(pid, from, "❌ Manager not found");
        return res.sendStatus(200);
      }

      const leaveId = "L" + Date.now();

      // ✅ SAVE IN DB
      await db.execute(
        `INSERT INTO leaves (emp_id, from_date, to_date, reason, status)
         VALUES (?, ?, ?, ?, 'Pending')`,
        [user.emp_id, data.from_date, data.to_date, data.reason]
      );

      await sendText(pid, from,
`✅ Leave Applied
Status: Pending`);

      await sendButtons(pid, manager.mobile,
`📢 Leave Request

Employee: ${user.name}
From: ${data.from_date}
To: ${data.to_date}
Reason: ${data.reason}`,
[
        btn(`APPROVE_LEAVE_${user.emp_id}`, "Approve"),
        btn(`REJECT_LEAVE_${user.emp_id}`, "Reject")
      ]);

      return res.sendStatus(200);
    }


    // ================== TEXT ==================
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        const user = await getUser(from);

        if (!user) {
          await sendText(pid, from, "❌ You are not registered.");
          return res.sendStatus(200);
        }

        await sendImage(pid, from, LOGO);
        await delay(500);

        await sendText(pid, from,
`Hello ${user.name}

Welcome to HRPlace 👋`);

        await delay(500);

        await menuFirst(pid, from);
        await delay(500);
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }


    // ================== BUTTON ==================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      // ===== ATTENDANCE =====
      if (id === "ATTENDANCE") {

        const user = await getUser(from);

        const [rows] = await db.execute(
          `SELECT date, status FROM attendance WHERE emp_id = ? ORDER BY date DESC LIMIT 5`,
          [user.emp_id]
        );

        let text = "📅 Recent Attendance:\n\n";

        rows.forEach(r => {
          text += `${r.date} - ${r.status}\n`;
        });

        await sendText(pid, from, text);

        return res.sendStatus(200);
      }

      // ===== LEAVE APPROVAL =====
      if (id.startsWith("APPROVE_LEAVE_") || id.startsWith("REJECT_LEAVE_")) {

        const [action, , emp_id] = id.split("_");

        const status = action === "APPROVE" ? "Approved" : "Rejected";

        await db.execute(
          `UPDATE leaves SET status = ? 
           WHERE emp_id = ? AND status='Pending'`,
          [status, emp_id]
        );

        await sendText(pid, from, `✅ ${status}`);

        return res.sendStatus(200);
      }

      // ===== EXISTING =====
      if (id === "LEAVE_MENU") return menuLeave(pid, from).then(()=>res.sendStatus(200));
      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));

      if (id === "CLAIM") return sendText(pid, from, "Claims module").then(()=>res.sendStatus(200));
      if (id === "PAYROLL") return sendText(pid, from, "Payroll module").then(()=>res.sendStatus(200));

      if (id === "POLICY") return sendText(pid, from, "Company policies").then(()=>res.sendStatus(200));
      if (id === "CONTACT") return sendText(pid, from, "HR Contact").then(()=>res.sendStatus(200));

      if (id === "BACK_MAIN") {
        await menuFirst(pid, from);
        await delay(500);
        return menuSecond(pid, from).then(()=>res.sendStatus(200));
      }
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


// ===== BUTTONS =====
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
`Main Services`,
  [
    btn("LEAVE_MENU", "Leave & Attendance"),
    btn("CLAIM", "Claims"),
    btn("PAYROLL", "Payroll")
  ]);
}

async function menuSecond(pid, to) {
  return sendButtons(pid, to,
`More options`,
  [
    btn("POLICY", "Policies"),
    btn("CONTACT", "Contact HR")
  ]);
}

async function menuLeave(pid, to) {

  await sendButtons(pid, to,
`Leave & Attendance`,
  [
    btn("LEAVE", "Apply Leave"),
    btn("ATTENDANCE", "View Attendance"),
    btn("BACK_MAIN", "Back")
  ]);
}


// ===== START =====
app.listen(3000, () => console.log("✅ HR BOT MYSQL READY"));
