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

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

const userState = new Map();
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ✅ NEW REGULARIZATION FUNCTIONS
const {
  handleCheckInRequest,
  handleLocationSubmit,
  handleApproval
} = require("./Regularization");

// ================= USER =================
async function getUser(phone) {
  let clean = phone.replace(/\D/g, "");
  let last10 = clean.slice(-10);

  const [rows] = await db.execute(
    `SELECT * FROM employees WHERE RIGHT(mobile,10)=? AND status='Active'`,
    [last10]
  );

  return rows[0] || null;
}

async function getManagerById(id) {
  const [rows] = await db.execute(
    "SELECT * FROM employees WHERE emp_id=? AND status='Active'",
    [id]
  );
  return rows[0] || null;
}

// ================= VERIFY =================
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ================= WEBHOOK =================
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

    // ================= ✅ APPLY LEAVE RESPONSE =================
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {
      const data = msg.interactive.nfm_reply.response_json;

      await sendText(pid, from,
`✅ Leave Applied Successfully

From: ${data.from_date}
To: ${data.to_date}
Reason: ${data.reason}`);

      return res.sendStatus(200);
    }

    // ================= TEXT =================
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase();

      if (text === "hi") {
        const user = await getUser(from);

        await sendImage(pid, from, LOGO);
        await delay(500);

        await sendText(pid, from, `Hello ${user.name} 👋`);
        await menuFirst(pid, from);
        await delay(500);
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }

    // ================= BUTTON =================
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id === "LEAVE_MENU") return menuLeave(pid, from).then(()=>res.sendStatus(200));
      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));

      // ✅ REGULARIZE MENU
      if (id === "REGULARIZE") {
        return sendButtons(pid, from,
`*Attendance Regularization*`,
[
          btn("CHECKIN", "Check-in"),
          btn("CHECKOUT", "Check-out"),
          btn("BACK_MAIN", "⬅ Back")
]).then(()=>res.sendStatus(200));
      }

      // ✅ CHECK-IN / CHECK-OUT
      if (id === "CHECKIN") {
        await handleCheckInRequest(from, pid, sendText, "checkin");
        return res.sendStatus(200);
      }

      if (id === "CHECKOUT") {
        await handleCheckInRequest(from, pid, sendText, "checkout");
        return res.sendStatus(200);
      }

      // ✅ APPROVAL
      if (id.startsWith("APPROVE_") || id.startsWith("REJECT_")) {
        await handleApproval(id, pid, from, db, sendText, getUser);
        return res.sendStatus(200);
      }

      if (id === "BACK_MAIN") {
        await menuFirst(pid, from);
        await delay(500);
        return menuSecond(pid, from).then(()=>res.sendStatus(200));
      }
    }

    // ✅ LOCATION HANDLER
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

// ================= MENUS =================
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
`*Leave & Attendance*`,
[
    btn("LEAVE", "Apply Leave"),
    btn("BALANCE", "Leave Balance"),
    btn("EDIT", "Edit/Cancel")
  ]);

  await delay(500);

  return sendButtons(pid, to,
`More actions`,
[
    btn("ATTENDANCE", "View Attendance"),
    btn("REGULARIZE", "Regularize"),
    btn("BACK_MAIN", "⬅ Back")
  ]);
}

app.listen(3000, () => console.log("✅ FULL BOT READY"));
