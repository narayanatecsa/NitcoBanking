const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;

const LOGO = "https://poojalist.com/Images/NewHRplace.png";

// ================== MYSQL ==================
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const userState = new Map();
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ✅ IMPORT NEW FUNCTIONS
const {
  handleCheckInRequest,
  handleLocationSubmit,
  handleApproval
} = require("./Regularization");

// ================== GET USER ==================
async function getUser(phone) {
  let clean = phone.replace(/\D/g, "");
  let last10 = clean.slice(-10);

  const [rows] = await db.execute(
    `SELECT * FROM employees WHERE RIGHT(mobile,10)=? AND status='Active'`,
    [last10]
  );

  return rows[0] || null;
}

// ================== GET MANAGER ==================
async function getManagerById(id) {
  const [rows] = await db.execute(
    "SELECT * FROM employees WHERE emp_id=? AND status='Active'",
    [id]
  );
  return rows[0] || null;
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

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    if (msg.id && userState.has(msg.id)) return res.sendStatus(200);
    userState.set(msg.id, true);

    // ================= TEXT =================
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase();

      if (text === "hi" || text === "hello") {
        const user = await getUser(from);
        if (!user) {
          await sendText(pid, from, "❌ Not registered");
          return res.sendStatus(200);
        }

        await sendImage(pid, from, LOGO);
        await delay(500);

        await sendText(pid, from, `Hello ${user.name} 👋`);
        await menuFirst(pid, from);

        return res.sendStatus(200);
      }
    }

    // ================= BUTTON =================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id === "LEAVE_MENU") {
        return menuLeave(pid, from).then(()=>res.sendStatus(200));
      }

      // ✅ REGULARIZE
      if (id === "REGULARIZE") {
        return sendButtons(pid, from,
`*Attendance*

Choose:`,
        [
          btn("CHECKIN", "Check-in"),
          btn("CHECKOUT", "Check-out")
        ]).then(()=>res.sendStatus(200));
      }

      // ✅ CHECK-IN
      if (id === "CHECKIN") {
        await handleCheckInRequest(from, pid, sendText);
        return res.sendStatus(200);
      }

      // ✅ CHECK-OUT (same flow)
      if (id === "CHECKOUT") {
        await handleCheckInRequest(from, pid, sendText, "checkout");
        return res.sendStatus(200);
      }

      // ✅ APPROVAL
      if (id.startsWith("APPROVE_") || id.startsWith("REJECT_")) {
        await handleApproval(
          id,
          pid,
          from,
          db,
          sendText,
          getUser
        );
        return res.sendStatus(200);
      }
    }

    // ✅ LOCATION MESSAGE
    if (msg.type === "location") {
      await handleLocationSubmit(
        msg,
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

    return res.sendStatus(200);

  } catch (e) {
    console.log(e);
    return res.sendStatus(200);
  }
});

// ================= SEND =================
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

// ================= MENU =================
async function menuFirst(pid, to) {
  return sendButtons(pid, to, "*Main Menu*", [
    btn("LEAVE_MENU", "Leave & Attendance")
  ]);
}

async function menuLeave(pid, to) {
  return sendButtons(pid, to, "*Attendance*", [
    btn("REGULARIZE", "Regularize")
  ]);
}

app.listen(3000, () => console.log("✅ BOT RUNNING"));
