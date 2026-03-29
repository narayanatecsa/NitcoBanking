const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const FLOW_ID = process.env.FLOW_ID;

const LOGO = "https://poojalist.com/Images/HRplace.jpeg";

// 🔥 CORE PROTECTION
const userState = new Map();

// ========= HELPERS =========
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// ✅ BLOCK USER ACTION (ANTI-REPEAT)
function blockUser(user, action, time = 300000) {
  const key = user + "_" + action;
  const now = Date.now();

  if (userState.has(key)) {
    const last = userState.get(key);

    if (now - last < time) {
      console.log("Blocked:", action);
      return true;
    }
  }

  userState.set(key, now);
  return false;
}

// ========= VERIFY =========
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ========= WEBHOOK =========
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    // ignore delivery updates
    if (change.statuses) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg || !msg.from || !msg.timestamp) {
      return res.sendStatus(200);
    }

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    // 🔴 FINAL FIX: IGNORE OLD RETRY MESSAGES
    const msgTime = parseInt(msg.timestamp) * 1000;
    const now = Date.now();

    if (now - msgTime > 60000) {   // 60 sec
      console.log("Old message ignored");
      return res.sendStatus(200);
    }

    // ========= FLOW SUBMIT =========
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {

      if (blockUser(from, "FLOW_SUBMIT", 300000)) {
        return res.sendStatus(200);
      }

      await sendText(pid, from, "✅ Leave Applied Successfully");
      return res.sendStatus(200);
    }

    // ========= STRICT FILTER =========
    if (
      msg.type !== "text" &&
      !(msg.type === "interactive" && msg.interactive?.button_reply)
    ) {
      return res.sendStatus(200);
    }

    // ========= TEXT =========
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        if (blockUser(from, "GREETING", 60000)) {
          return res.sendStatus(200);
        }

        await sendImage(pid, from, LOGO);
        await delay(1000);

        const g = getGreeting();

        await sendText(
          pid,
          from,
          `*${g}*\n\nWelcome to *HR PLACE*\nPlease select option`
        );

        await delay(800);
        await menuMain(pid, from);

        await delay(800);
        await menuQuick(pid, from);
      }

      return res.sendStatus(200);
    }

    // ========= BUTTON =========
    if (msg.type === "interactive" && msg.interactive?.button_reply) {

      const btnId = msg.interactive.button_reply.id;

      if (btnId === "MAIN") {
        if (blockUser(from, "MAIN", 60000)) return res.sendStatus(200);
        await menuMain(pid, from);
        return res.sendStatus(200);
      }

      if (btnId === "LEAVE") {
        if (blockUser(from, "LEAVE", 60000)) return res.sendStatus(200);
        await menuLeave(pid, from);
        return res.sendStatus(200);
      }

      if (btnId === "CLAIM") {
        await menuClaim(pid, from);
        return res.sendStatus(200);
      }

      if (btnId === "PAY") {
        await menuPay(pid, from);
        return res.sendStatus(200);
      }

      if (btnId === "BACK") {
        await menuMain(pid, from);
        return res.sendStatus(200);
      }

      if (btnId === "POL") {
        await sendText(pid, from, "📘 Policies will be shared soon");
        return res.sendStatus(200);
      }

      if (btnId === "HR") {
        await sendText(pid, from, "👨‍💼 Contact HR: hr@company.com");
        return res.sendStatus(200);
      }

      // ========= APPLY FLOW =========
      if (btnId === "APPLY") {

        if (blockUser(from, "APPLY", 300000)) {
          return res.sendStatus(200);
        }

        await sendFlow(pid, from);
        return res.sendStatus(200);
      }

      if (btnId === "SUBMIT_CLAIM") {
        await claimLink(pid, from);
        return res.sendStatus(200);
      }
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log(e);
    return res.sendStatus(200);
  }
});

// ========= FLOW =========
async function sendFlow(pid, to) {
  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "flow",
        body: { text: "📄 Apply Leave Form" },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_id: FLOW_ID,
            flow_cta: "Apply Now"
          }
        }
      }
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );
}

// ========= SEND =========
async function sendText(pid, to, body) {
  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );
}

async function sendImage(pid, to, url) {
  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: url }
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );
}

// ========= BUTTON =========
function btn(id, title) {
  return { type: "reply", reply: { id, title } };
}

async function sendButtons(pid, to, text, buttons) {
  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: { buttons }
      }
    },
    {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }
  );
}

// ========= MENUS =========
async function menuMain(pid, to) {
  return sendButtons(pid, to, "📋 *Main Menu*", [
    btn("LEAVE", "📅 Leave"),
    btn("CLAIM", "💰 Claims"),
    btn("PAY", "🏦 Payroll")
  ]);
}

async function menuQuick(pid, to) {
  return sendButtons(pid, to, "⚡ Quick Services", [
    btn("POL", "📘 Policies"),
    btn("HR", "👨‍💼 Contact HR"),
    btn("MAIN", "🏠 Main Menu")
  ]);
}

async function menuLeave(pid, to) {
  return sendButtons(pid, to, "📅 Leave Menu", [
    btn("APPLY", "Apply Leave"),
    btn("BACK", "Back")
  ]);
}

async function menuClaim(pid, to) {
  return sendButtons(pid, to, "💰 Claims", [
    btn("SUBMIT_CLAIM", "Submit"),
    btn("BACK", "Back")
  ]);
}

async function claimLink(pid, to) {
  await sendText(pid, to, "Submit claim:\nhttps://application.hrplace.com.my/claims/");
}

async function menuPay(pid, to) {
  return sendButtons(pid, to, "🏦 Payroll", [
    btn("BACK", "Back")
  ]);
}

app.listen(3000, () => console.log("HR BOT READY"));
