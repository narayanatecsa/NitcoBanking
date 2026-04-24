const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ===== VERIFY WEBHOOK =====
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// ===== MAIN WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body.entry?.[0]?.changes?.[0]?.value;
    if (!change) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    // ===== TEXT (HI FLOW) =====
    if (msg.type === "text") {
      const text = msg.text.body.toLowerCase().trim();

      if (text === "hi" || text === "hello") {

        // FULL WELCOME MESSAGE
        await sendText(pid, from,
`Hello PSRNL Narayana!

Welcome to HRPlace AI Chat Bot

You are just 2 Steps away to experience a whole new way of HRPlace that is convenient, secure and fast..!

To know more, feel free to check out our:

Terms and Conditions:
https://www.hrplace.com.my/termsandconditions.php

Privacy Policy:
https://www.hrplace.com.my/privacy_policy.php

Lets get started!

Simply Select from the options below or Type your query to get started.`
        );

        await delay(800);

        // MAIN BUTTONS
        await sendButtons(pid, from,
`Choose an option:`,
[
  btn("LEAVE", "Leave"),
  btn("ATT_PAYROLL", "Attendance & Payroll"),
  btn("CLAIM", "Claim")
]);

        await delay(800);

        // QUICK SERVICES
        await sendButtons(pid, from,
`Quick Services is just a click away :`,
[
  btn("SHIFT", "Shift & Roster"),
  btn("MORE", "More")
]);

        return res.sendStatus(200);
      }
    }

    // ===== BUTTON HANDLER =====
    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      const id = msg.interactive.button_reply.id;

      // MORE SERVICES
      if (id === "MORE") {
        return sendButtons(pid, from,
`More Services`,
[
  btn("HOLIDAYS", "Public Holidays"),
  btn("CONTACT", "Contact HR"),
  btn("BACK", "⬅ Back")
]).then(()=>res.sendStatus(200));
      }

      // PUBLIC HOLIDAYS
      if (id === "HOLIDAYS") {
        await sendText(pid, from,
`You are Right There!

Here are your Public Holiday Details:
• Public Holiday Information`
        );

        await delay(500);

        return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
      }

      // CONTACT HR
      if (id === "CONTACT") {
        await sendText(pid, from,
`You are Right There!

Here are your HR Contact Details:
• Phone & Email`
        );

        await delay(500);

        return sendButtons(pid, from,
`More Options`,
[
  btn("BACK", "⬅ Back to Main Menu")
]).then(()=>res.sendStatus(200));
      }

      // BACK TO MAIN
      if (id === "BACK") {
        await sendButtons(pid, from,
`Choose an option:`,
[
  btn("LEAVE", "Leave"),
  btn("ATT_PAYROLL", "Attendance & Payroll"),
  btn("CLAIM", "Claim")
]);

        await delay(800);

        return sendButtons(pid, from,
`Quick Services is just a click away :`,
[
  btn("SHIFT", "Shift & Roster"),
  btn("MORE", "More")
]).then(()=>res.sendStatus(200));
      }
    }

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
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

function btn(id, title) {
  return {
    type: "reply",
    reply: { id, title }
  };
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

// ===== START SERVER =====
app.listen(3000, () => console.log("✅ Bot running on port 3000"));
