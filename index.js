const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const GOOGLE_API = process.env.GOOGLE_API;



// ========= GOOGLE =========

async function getSheet(sheet) {
  try {
    const res = await axios.get(`${GOOGLE_API}?sheet=${sheet}`);
    return res.data || [];
  } catch (e) {
    return [];
  }
}



// ========= EMP =========

async function getEmployeeName(mobile) {

  const list = await getSheet("Emp_Details");

  const emp = list.find(
    x => String(x.Mobile).endsWith(mobile)
  );

  if (emp) return emp.Name;

  return null;
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

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = entry.metadata.phone_number_id;



    // ===== TEXT =====

    if (msg.type === "text") {

      const text = msg.text.body.toLowerCase();

      if (text === "hi" || text === "hello") {

        const name = await getEmployeeName(from);

        if (!name) {
          await sendText(pid, from, "Not registered");
          return;
        }

        await sendText(pid, from, `Welcome ${name}`);
        await menuMain(pid, from);

      }

    }



    // ===== BUTTON =====

    if (
      msg.type === "interactive" &&
      msg.interactive.button_reply
    ) {

      const id = msg.interactive.button_reply.id;


      if (id === "MAIN") return menuMain(pid, from);

      if (id === "MORE") return menuMore(pid, from);

      if (id === "BACK") return menuMain(pid, from);


      // MAIN
      if (id === "APPLY") return menuApply(pid, from);
      if (id === "VIEW") return menuView(pid, from);
      if (id === "PROFILE") return menuProfile(pid, from);
      if (id === "REQUEST") return menuRequest(pid, from);


      // APPLY
      if (id === "LEAVE") return sendText(pid, from, "Leave");
      if (id === "CLAIM") return sendText(pid, from, "Claim");
      if (id === "OT") return sendText(pid, from, "Overtime");


      // VIEW
      if (id === "CAL") return sendText(pid, from, "Calendar");
      if (id === "PAY") return sendText(pid, from, "Payslip");
      if (id === "TIME") return sendText(pid, from, "Time Sheet");


      // PROFILE
      if (id === "VPRO") return sendText(pid, from, "Profile");
      if (id === "RM") return sendText(pid, from, "Manager");
      if (id === "REPO") return sendText(pid, from, "Reportee");


      // REQUEST
      if (id === "INT") return sendText(pid, from, "Internal");
      if (id === "EXT") return sendText(pid, from, "External");

    }

    res.sendStatus(200);

  } catch (e) {
    console.log(e);
    res.sendStatus(200);
  }

});



// ========= BUTTON SENDER =========

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



// ========= MAIN =========

async function menuMain(pid, to) {

  return sendButtons(
    pid,
    to,
    "Main Menu",
    [
      btn("APPLY", "Apply"),
      btn("VIEW", "View"),
      btn("MORE", "More")
    ]
  );

}



// ========= MORE =========

async function menuMore(pid, to) {

  return sendButtons(
    pid,
    to,
    "More",
    [
      btn("PROFILE", "Profile"),
      btn("REQUEST", "Request"),
      btn("BACK", "Back")
    ]
  );

}



// ========= APPLY =========

async function menuApply(pid, to) {

  return sendButtons(
    pid,
    to,
    "Apply",
    [
      btn("LEAVE", "Leave"),
      btn("CLAIM", "Claim"),
      btn("OT", "Overtime")
    ]
  );

}



// ========= VIEW =========

async function menuView(pid, to) {

  return sendButtons(
    pid,
    to,
    "View",
    [
      btn("CAL", "Calendar"),
      btn("PAY", "Payslip"),
      btn("TIME", "Time Sheet")
    ]
  );

}



// ========= PROFILE =========

async function menuProfile(pid, to) {

  return sendButtons(
    pid,
    to,
    "Profile",
    [
      btn("VPRO", "View"),
      btn("RM", "Manager"),
      btn("MAIN", "Main Menu")
    ]
  );

}



// ========= REQUEST =========

async function menuRequest(pid, to) {

  return sendButtons(
    pid,
    to,
    "Request",
    [
      btn("INT", "Internal"),
      btn("EXT", "External"),
      btn("MAIN", "Main Menu")
    ]
  );

}



// ========= BUTTON HELPER =========

function btn(id, title) {

  return {
    type: "reply",
    reply: {
      id,
      title
    }
  };

}



// ========= TEXT =========

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



app.listen(3000, () => {
  console.log("HR BOT RUNNING");
});
