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

// ================== MYSQL ==================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

const userState = new Map();
const leaveDB = new Map();
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ================== GET USER ==================
async function getUser(phone) {
  try {
    let clean = phone.replace(/\D/g, "");
    let last10 = clean.slice(-10);

    const [rows] = await db.execute(
      `SELECT * FROM employees 
       WHERE RIGHT(mobile,10)=? 
       AND status='Active'`,
      [last10]
    );

    return rows[0] || null;

  } catch (err) {
    console.log("DB ERROR:", err);
    return null;
  }
}

// ================== GET MANAGER ==================
async function getManagerById(id) {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM employees WHERE emp_id=? AND status='Active'",
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    console.log("Manager error:", err);
    return null;
  }
}

// ================== VERIFY ==================
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

    if (change.statuses) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    // Prevent duplicate
    if (msg.id) {
      if (userState.has(msg.id)) return res.sendStatus(200);
      userState.set(msg.id, true);
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

        await sendText(pid, from, `Hello ${user.name} 👋`);
        await menuFirst(pid, from);
        await delay(500);
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }

    // ================== BUTTONS ==================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id === "LEAVE_MENU") return menuLeave(pid, from).then(()=>res.sendStatus(200));
      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));

      // ✅ ================= REGULARIZATION =================
      if (id === "REGULARIZE") {
        return sendButtons(pid, from,
`*Attendance Regularization*

Choose action:`,
        [
          btn("CHECKIN", "Check-in"),
          btn("CHECKOUT", "Check-out"),
          btn("BACK_MAIN", "⬅ Back")
        ]).then(()=>res.sendStatus(200));
      }

      if (id === "CHECKIN" || id === "CHECKOUT") {
        const handleAttendance = require("./Regularization");

        await handleAttendance(
          id === "CHECKIN" ? "checkin" : "checkout",
          req,
          pid,
          from,
          db,
          getUser,
          getManagerById,
          sendText,
          sendButtons
        );

        return res.sendStatus(200);
      }

      // ================= APPROVAL =================
      if (id.startsWith("APPROVE_") || id.startsWith("REJECT_")) {
        const status = id.startsWith("APPROVE_") ? "Approved" : "Rejected";
        const attendanceId = id.split("_")[1];

        const manager = await getUser(from);

        await db.execute(
          `UPDATE attendance 
           SET approval_status=?, approved_by=? 
           WHERE attendance_id=?`,
          [status, manager.emp_id, attendanceId]
        );

        await sendText(pid, from, `✅ ${status}`);
        return res.sendStatus(200);
      }

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

// ================== SEND ==================
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

// ================== MENUS ==================
async function menuFirst(pid, to) {
  return sendButtons(pid, to, "*Main Services*", [
    btn("LEAVE_MENU", "Leave & Attendance"),
    btn("CLAIM", "Claims"),
    btn("PAYROLL", "Payroll")
  ]);
}

async function menuSecond(pid, to) {
  return sendButtons(pid, to, "More options:", [
    btn("POLICY", "Policies"),
    btn("CONTACT", "Contact HR")
  ]);
}

async function menuLeave(pid, to) {
  await sendButtons(pid, to,
`*Leave & Attendance*

Select an action:`,
  [
    btn("LEAVE", "Apply Leave"),
    btn("BALANCE", "Leave Balance"),
    btn("EDIT", "Edit/Cancel")
  ]);

  await delay(500);

  return sendButtons(pid, to,
`More actions:`,
  [
    btn("ATTENDANCE", "View Attendance"),
    btn("REGULARIZE", "Regularize"),
    btn("BACK_MAIN", "⬅ Back")
  ]);
}

app.listen(3000, () => console.log("✅ HR BOT READY"));
