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

const userState = new Map();

// ===== Anti Repeat =====
function blockUser(user, action, time = 300000) {
  const key = user + "_" + action;
  const now = Date.now();
  if (userState.has(key)) {
    if (now - userState.get(key) < time) return true;
  }
  userState.set(key, now);
  return false;
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

    // ===== FLOW RESPONSE =====
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {
      if (blockUser(from, "FLOW", 300000)) return res.sendStatus(200);
      await sendText(pid, from, "Leave applied successfully");
      return res.sendStatus(200);
    }

    // ===== TEXT =====
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {
        if (blockUser(from, "GREETING", 60000)) {
          return res.sendStatus(200);
        }

        await sendImage(pid, from, LOGO);
        await delay(800);

        await sendText(pid, from,
`MAIN MENU

Apply
› Leave
› Claim

View
› Payslip
› Time Sheet

Type your choice or use buttons below`
        );

        await delay(500);
        await menuMain(pid, from);

        return res.sendStatus(200);
      }
    }

    // ===== BUTTON =====
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      if (id === "APPLY") return menuApply(pid, from).then(()=>res.sendStatus(200));
      if (id === "VIEW") return menuView(pid, from).then(()=>res.sendStatus(200));

      if (id === "LEAVE") return sendFlow(pid, from).then(()=>res.sendStatus(200));
      if (id === "CLAIM") return sendText(pid, from, "Claim module").then(()=>res.sendStatus(200));

      if (id === "PAYSLIP") return sendText(pid, from, "Payslip module").then(()=>res.sendStatus(200));
      if (id === "TIMESHEET") return sendText(pid, from, "Timesheet module").then(()=>res.sendStatus(200));

      if (id === "BACK") return menuMain(pid, from).then(()=>res.sendStatus(200));
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log(e);
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

const delay = (ms) => new Promise(r => setTimeout(r, ms));

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

// ===== BUTTON HELPER =====
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

// MAIN (2 buttons)
async function menuMain(pid, to) {
  return sendButtons(pid, to, "Select Menu", [
    btn("APPLY", "Apply"),
    btn("VIEW", "View")
  ]);
}

// APPLY SUBMENU (2 + BACK)
async function menuApply(pid, to) {
  return sendButtons(pid, to,
`Apply

› Leave
› Claim`,
    [
      btn("LEAVE", "Leave"),
      btn("CLAIM", "Claim"),
      btn("BACK", "Back")
    ]
  );
}

// VIEW SUBMENU (2 + BACK)
async function menuView(pid, to) {
  return sendButtons(pid, to,
`View

› Payslip
› Time Sheet`,
    [
      btn("PAYSLIP", "Payslip"),
      btn("TIMESHEET", "Time Sheet"),
      btn("BACK", "Back")
    ]
  );
}

app.listen(3000, () => console.log("HR BOT READY"));
