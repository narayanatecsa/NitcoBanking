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

// ===== MYSQL CONNECTION =====
const db = mysql.createPool({
  host: "localhost",
  user: "psrnlnarayana_poojalist",
  password: "5ucce55Ex@narayana",
  database: "psrnlnarayana_HRPlace"
});

// ===== MEMORY =====
const userState = new Map();
const leaveDB = new Map();

const delay = (ms) => new Promise(r => setTimeout(r, ms));


// ================== ✅ GET USER FROM DB ==================
async function getUser(phone) {
  try {
    const clean = phone.replace(/\D/g, "");

    const [rows] = await db.execute(
      "SELECT * FROM employees WHERE mobile = ? AND status = 'Active'",
      [clean]
    );

    return rows[0] || null;

  } catch (err) {
    console.log("DB error:", err.message);
    return null;
  }
}


// ================== ✅ GET MANAGER ==================
async function getManagerById(manager_id) {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM employees WHERE emp_id = ?",
      [manager_id]
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


// ================== WEBHOOK ==================
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

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

        return res.sendStatus(200);
      }
    }


    // ================== BUTTON ==================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      // ===== ATTENDANCE MARK =====
      if (id === "MARK_ATTENDANCE") {

        const user = await getUser(from);

        await db.execute(
          `INSERT INTO attendance (emp_id, date, check_in, status, approval_status)
           VALUES (?, CURDATE(), NOW(), 'Present', 'Pending')`,
          [user.emp_id]
        );

        // Get Manager
        const manager = await getManagerById(user.manager_id);

        await sendText(pid, from, "✅ Attendance Marked (Pending Approval)");

        // Send to Manager
        if (manager) {
          await sendButtons(pid, manager.mobile,
`📢 Attendance Approval

Employee: ${user.name}
Date: Today`,
          [
            btn(`APPROVE_ATT_${user.emp_id}`, "Approve"),
            btn(`REJECT_ATT_${user.emp_id}`, "Reject")
          ]);
        }

        return res.sendStatus(200);
      }


      // ===== APPROVAL =====
      if (id.startsWith("APPROVE_ATT_") || id.startsWith("REJECT_ATT_")) {

        const [action, emp_id] = id.split("_ATT_");

        const status = action === "APPROVE" ? "Approved" : "Rejected";

        await db.execute(
          `UPDATE attendance 
           SET approval_status = ? 
           WHERE emp_id = ? AND date = CURDATE()`,
          [status, emp_id]
        );

        await sendText(pid, from, `✅ ${status}`);

        return res.sendStatus(200);
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


// ===== MENU =====
async function menuFirst(pid, to) {
  return sendButtons(pid, to,
`Main Menu`,
  [
    btn("MARK_ATTENDANCE", "Mark Attendance")
  ]);
}


// ===== START SERVER =====
app.listen(3000, () => console.log("✅ HR BOT (MYSQL) READY"));
