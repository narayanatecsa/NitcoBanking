const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());
app.use(express.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY
  ) {
    return res.send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    console.log("==== INCOMING REQUEST ====");
    console.log(JSON.stringify(req.body, null, 2));

    // ✅ Safe extraction
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value || !value.messages) {
      console.log("No messages found");
      return res.sendStatus(200);
    }

    const msg = value.messages[0];
    const from = msg.from;
    const pid = value.metadata.phone_number_id;

    console.log("From:", from);
    console.log("Type:", msg.type);

    // 🔥 TEMP TEST RESPONSE
    await sendText(pid, from, "Webhook working perfectly!");

    return res.sendStatus(200);

  } catch (error) {
    console.log("ERROR:", error.message);
    return res.sendStatus(200);
  }
});

// ===== SEND TEXT =====
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
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

app.listen(3000, () => console.log("🚀 BOT RUNNING"));
