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

// ✅ Malaysia Time Greeting
function getGreeting() {
  const malaysiaTime = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kuala_Lumpur"
  });
  const h = new Date(malaysiaTime).getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// ✅ Get Name from Sheet
async function getUserName(phone) {
  try {
    const res = await axios.get(SHEET_API);
    const users = res.data;

    // ✅ normalize WhatsApp number
    const cleanIncoming = phone.replace(/\D/g, "");

    console.log("Incoming:", cleanIncoming);

    const user = users.find(u => {
      const sheetPhone = String(u.Mobile).replace(/\D/g, "");
      return sheetPhone === cleanIncoming;
    });

    console.log("Matched User:", user);

    if (user && user.Status === "Active") {
      return user.Name;
    }

    return null;

  } catch (err) {
    console.log("Sheet Error:", err.message);
    return null;
  }
}
// ✅ Anti Repeat
function blockUser(user, action, time = 300000) {
  const key = user + "_" + action;
  const now = Date.now();

  if (userState.has(key)) {
    if (now - userState.get(key) < time) return true;
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

    if (change.statuses) return res.sendStatus(200);

    const msg = change.messages?.[0];
    if (!msg || !msg.from || !msg.timestamp) {
      return res.sendStatus(200);
    }

    const from = msg.from;
    const pid = change.metadata.phone_number_id;

    const msgTime = parseInt(msg.timestamp) * 1000;
    if (Date.now() - msgTime > 60000) return res.sendStatus(200);

    // ========= FLOW =========
    if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") {
      if (blockUser(from, "FLOW_SUBMIT", 300000)) return res.sendStatus(200);
      await sendText(pid, from, "Leave Applied Successfully");
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
        const name = await getUserName(from);

        // ❌ Not registered
        if (!name) {
          await sendText(
            pid,
            from,
            "❌ You are not registered. Please contact HR."
          );
          return res.sendStatus(200);
        }

        // ✅ Registered
        await sendText(
          pid,
          from,
          `*${g} ${name}*\n\nSimple select from the options below`
        );

        await delay(800);
        await menuMain(pid, from);

        await delay(800);
        await menuQuick(pid, from);

        return res.sendStatus(200);
      }
    }

    // ========= BUTTON =========
    if (msg.type === "interactive" && msg.interactive?.button_reply) {

      const btnId = msg.interactive.button_reply.id;

      if (btnId === "MAIN") return menuMain(pid, from).then(()=>res.sendStatus(200));
      if (btnId === "LEAVE") return menuLeave(pid, from).then(()=>res.sendStatus(200));
      if (btnId === "CLAIM") return menuClaim(pid, from).then(()=>res.sendStatus(200));
      if (btnId === "PAY") return menuPay(pid, from).then(()=>res.sendStatus(200));
      if (btnId === "BACK") return menuMain(pid, from).then(()=>res.sendStatus(200));

      if (btnId === "POL") {
        await sendText(pid, from, "📘 Policies coming soon");
        return res.sendStatus(200);
      }

      if (btnId === "HR") {
        await sendText(pid, from, "Contact HR: hr@company.com");
        return res.sendStatus(200);
      }

      if (btnId === "APPLY") {
        await sendFlow(pid, from);
        return res.sendStatus(200);
      }

      if (btnId === "SUBMIT_CLAIM") {
        await sendText(pid, from, "Submit claim:\nhttps://www.hrplace.com.my/claims/");
        return res.sendStatus(200);
      }
    }

    return res.sendStatus(200);

  } catch (e) {
    console.log("ERROR:", e);
    return res.sendStatus(200);
  }
});

// ========= SEND =========
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

// ========= FLOW =========
async function sendFlow(pid, to) {
  await axios.post(`https://graph.facebook.com/v23.0/${pid}/messages`, {
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
  }, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
}

// ========= BUTTON =========
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

// ========= MENUS =========
async function menuMain(pid, to) {
  return sendButtons(pid, to, "Main Menu", [
    btn("LEAVE", "Leave"),
    btn("CLAIM", "Claims"),
    btn("PAY", "Payroll")
  ]);
}

async function menuQuick(pid, to) {
  return sendButtons(pid, to, "Quick Services", [
    btn("POL", "Policies"),
    btn("HR", "Contact HR"),
    btn("MAIN", "Main Menu")
  ]);
}

async function menuLeave(pid, to) {
  return sendButtons(pid, to, "Leave Menu", [
    btn("APPLY", "Apply Leave"),
    btn("BACK", "Back")
  ]);
}

async function menuClaim(pid, to) {
  return sendButtons(pid, to, "Claims", [
    btn("SUBMIT_CLAIM", "Submit"),
    btn("BACK", "Back")
  ]);
}

async function menuPay(pid, to) {
  return sendButtons(pid, to, "Payroll", [
    btn("BACK", "Back")
  ]);
}

app.listen(3000, () => console.log("✅ HR BOT READY"));
