const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const { google } = require("googleapis");

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.VERIFY;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const SHEET_ID = process.env.SHEET_ID;


// =========================
// GOOGLE SHEET FUNCTION
// =========================

async function getEmployeeByMobile(mobile) {

  const auth = new google.auth.GoogleAuth({
    keyFile: "service.json", // service account file
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({
    auth,
    version: "v4",
  });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Emp_Details!A2:F",
  });

  const rows = res.data.values;

  if (!rows) return null;

  for (let row of rows) {

    let sheetMobile = row[2]; // column C mobile
    let name = row[1]; // column B name

    if (mobile.endsWith(sheetMobile)) {
      return name;
    }
  }

  return null;
}



// =========================
// SEND WHATSAPP
// =========================

async function sendMessage(to, text) {

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );
}



// =========================
// MENU MESSAGE
// =========================

async function sendMenu(to) {

  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "Select Menu",
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "1", title: "Attendance" },
            },
            {
              type: "reply",
              reply: { id: "2", title: "Leave" },
            },
            {
              type: "reply",
              reply: { id: "3", title: "Salary" },
            },
          ],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );
}



// =========================
// WEBHOOK VERIFY
// =========================

app.get("/webhook", (req, res) => {

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});



// =========================
// WEBHOOK RECEIVE
// =========================

app.post("/webhook", async (req, res) => {

  try {

    const msg =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body || "";

    console.log("Message:", text, "From:", from);


    // only first hi
    if (
      text.toLowerCase() === "hi" ||
      text.toLowerCase() === "hello" ||
      text.toLowerCase() === "start"
    ) {

      const name = await getEmployeeByMobile(from);

      if (name) {

        await sendMessage(
          from,
          `Welcome ${name} to HR Place`
        );

        await sendMenu(from);

      } else {

        await sendMessage(
          from,
          "You are not registered in HR Place"
        );
      }
    }

  } catch (err) {
    console.log(err);
  }

  res.sendStatus(200);
});



app.listen(3000, () => {
  console.log("Server running");
});
