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
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ===== CHECK USER =====
async function getUser(phone) {
  try {
    const res = await axios.get(SHEET_API);
    const users = res.data;

    const clean = phone.replace(/\D/g, "");

    const user = users.find(u =>
      String(u.Mobile).replace(/\D/g, "") === clean
    );

    return user && user.Status === "Active" ? user : null;

  } catch (err) {
    console.log("Sheet error:", err.message);
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

    // ✅ Prevent duplicate messages
    if (msg.id) {
      if (userState.has(msg.id)) return res.sendStatus(200);
      userState.set(msg.id, true);
    }

    // ===== FLOW RESPONSE =====
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {
      await sendText(pid, from, "✅ Leave applied successfully");
      return res.sendStatus(200);
    }

    // ===== TEXT =====
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        const user = await getUser(from);

        if (!user) {
          await sendText(pid, from, "❌ You are not registered. Please contact HR.");
          return res.sendStatus(200);
        }

        const firstKey = from + "_FIRST";

        // LOGO
        await sendImage(pid, from, LOGO);
        await delay(800);

        // Instructions only once
        if (!userState.has(firstKey)) {
          userState.set(firstKey, true);

          await sendText(pid, from,
`Welcome ${user.Name}

Please choose a service below.`);
          await delay(800);
        }

        // First 3 buttons
        await menuFirst(pid, from);
        await delay(600);

        // Next 2 buttons
        await menuSecond(pid, from);

        return res.sendStatus(200);
      }
    }

    // ===== BUTTON =====
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id === "LEAVE_MENU") return menuLeave(pid, from).then(()=>res.sendStatus(200));

      if (id === "CLAIM") return sendText(pid, from, "💰 Claims module").then(()=>res.sendStatus(200));
      if (id === "PAYROLL") return sendText(pid, from, "🏦 Payroll module").then(()=>res.sendStatus(200));

      if (id === "POLICY") return sendText(pid, from, "📄 Company policies").then(()=>res.sendStatus(200));
      if (id === "CONTACT") return sendText(pid, from, "📞 HR Contact: +91 XXXXX").then(()=>res.sendStatus(200));

      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));
      if (id === "OVERTIME") return sendText(pid, from, "⏱ Overtime module").then(()=>res.sendStatus(200));

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

// ===== BUTTON =====
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
`🏢 *Main Services*`,
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

async function menuLeave(pid, to) {
  return sendButtons(pid, to,
`📅 *Leave & Attendance*`,
  [
    btn("LEAVE", "Apply Leave"),
    btn("OVERTIME", "Overtime"),
    btn("BACK_MAIN", "⬅ Back")
  ]);
}

app.listen(3000, () => console.log("✅ HR BOT READY"));
