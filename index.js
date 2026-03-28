const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const GOOGLE_API = process.env.GOOGLE_API;

const FLOW_ID = "1215671090363734";

const LOGO = "https://poojalist.com/Images/HRplace.jpeg";

const processed = new Set();


// ========= GREETING =========
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
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
    if (change.statuses) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const id = msg.id;
    if (processed.has(id)) return res.sendStatus(200);
    processed.add(id);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;


    // ========= TEXT =========
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        await sendImage(pid, from, LOGO);

        const g = getGreeting();

        await sendText(
          pid,
          from,
          `*${g}*\n\nWelcome to *HR PLACE*\nPlease select option`
        );

        await menuMain(pid, from);
      }

      return res.sendStatus(200);
    }


    // ========= BUTTON =========
    if (msg.type === "interactive" && msg.interactive?.button_reply) {

      const id = msg.interactive.button_reply.id;

      if (id === "MAIN") return menuMain(pid, from);
      if (id === "LEAVE") return menuLeave(pid, from);
      if (id === "CLAIM") return menuClaim(pid, from);
      if (id === "PAY") return menuPay(pid, from);
      if (id === "BACK") return menuMain(pid, from);

      // 🔥 APPLY LEAVE → SEND FLOW
      if (id === "APPLY") {
        return sendFlow(pid, from);
      }

      if (id === "SUBMIT_CLAIM") return claimLink(pid, from);
    }

    res.sendStatus(200);

  } catch (e) {
    console.log(e);
    res.sendStatus(200);
  }
});


// ========= SEND FLOW =========
async function sendFlow(pid, to) {
  await axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "flow",
        body: {
          text: "📄 Apply Leave Form"
        },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_id: "1215671090363734",
            flow_cta: "Apply Now"
          }
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
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
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
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
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
    }
  );
}

function btn(id, title) {
  return {
    type: "reply",
    reply: { id, title }
  };
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
      headers: {
        Authorization: `Bearer ${TOKEN}`
      }
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
  await sendText(
    pid,
    to,
    `Submit claim:\nhttps://application.hrplace.com.my/claims/`
  );
}

async function menuPay(pid, to) {
  return sendButtons(pid, to, "🏦 Payroll", [
    btn("BACK", "Back")
  ]);
}


app.listen(3000, () => console.log("HR BOT READY"));
