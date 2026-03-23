const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;
const GOOGLE_API = process.env.GOOGLE_API;
const PHONE_ID = process.env.PHONE_NUMBER_ID;

let userState = {};
let otpStore = {};
let sessionStore = {};


// ================= OTP =================

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hasSession(mobile) {

  const s = sessionStore[mobile];

  if (!s) return false;

  const now = Date.now();
  const diff = now - s;

  return diff < 12 * 60 * 60 * 1000;
}


// ================= GOOGLE =================

async function getSheet(sheet) {

  const res = await axios.get(
    `${GOOGLE_API}?sheet=${sheet}`
  );

  return res.data || [];
}


async function findEmployee(mobile) {

  const list = await getSheet("Emp_Details");

  return list.find(
    x => String(x.Mobile) === String(mobile)
  );

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

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = entry.metadata.phone_number_id;



    // ================= TEXT =================

    if (msg.type === "text") {

      const text = msg.text.body.trim();


      // OTP verify

      if (userState[from]?.step === "otp") {

        if (text === otpStore[from]) {

          sessionStore[from] = Date.now();

          const emp = await findEmployee(from);

          await sendMainMenu(pid, from, emp.Name);

        } else {

          await sendText(
            pid,
            from,
            "Wrong OTP"
          );
        }

        return res.sendStatus(200);
      }



      // check session

      if (hasSession(from)) {

        const emp = await findEmployee(from);

        await sendMainMenu(pid, from, emp.Name);

        return res.sendStatus(200);
      }



      // check employee

      const emp = await findEmployee(from);

      if (!emp) {

        await sendText(
          pid,
          from,
          "You are not registered employee"
        );

        return res.sendStatus(200);
      }



      // send OTP

      const otp = generateOTP();

      otpStore[from] = otp;

      userState[from] = { step: "otp" };

      await sendText(
        pid,
        from,
        `HR Place OTP: ${otp}`
      );

      return res.sendStatus(200);

    }



    // ================= BUTTON =================

    if (
      msg.type === "interactive" &&
      msg.interactive.button_reply
    ) {

      const id =
        msg.interactive.button_reply.id;


      if (id === "APPLY") {

        await sendText(pid, from, "Apply menu");

      }

      if (id === "VIEW") {

        await sendText(pid, from, "View menu");

      }

      if (id === "PROFILE") {

        await sendText(pid, from, "Profile menu");

      }

      if (id === "TICKET") {

        await sendText(pid, from, "Ticket menu");

      }

      return res.sendStatus(200);

    }


    res.sendStatus(200);

  } catch (e) {

    console.log(e);
    res.sendStatus(200);

  }

});



// ================= MENU =================

async function sendMainMenu(pid,to,name){

  await sendButtons(
    pid,
    to,
    `Hi ${name}\nSelect option`,
    [
      ["APPLY","APPLY"],
      ["VIEW","VIEW"],
      ["PROFILE","PROFILE"],
      ["TICKET","TICKET"]
    ]
  );

}



// ================= SEND =================

async function sendText(pid,to,body){

  return axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product:"whatsapp",
      to,
      text:{ body }
    },
    {
      headers:{
        Authorization:`Bearer ${TOKEN}`
      }
    }
  );

}


async function sendButtons(pid,to,body,buttons){

  return axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product:"whatsapp",
      to,
      type:"interactive",
      interactive:{
        type:"button",
        body:{ text: body },
        action:{
          buttons:buttons.map(b=>({
            type:"reply",
            reply:{
              id:b[0],
              title:b[1]
            }
          }))
        }
      }
    },
    {
      headers:{
        Authorization:`Bearer ${TOKEN}`
      }
    }
  );

}



app.listen(3000,()=>{

  console.log("HR PLACE RUNNING");

});
