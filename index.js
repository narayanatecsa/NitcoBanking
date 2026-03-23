const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const TOKEN = process.env.TOKEN;
const VERIFY = process.env.MYTOKEN;


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

    console.log("MSG:", JSON.stringify(req.body));

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const pid = entry.metadata.phone_number_id;


    // TEXT

    if (msg.type === "text") {

      await sendButtons(
        pid,
        from,
        "Main Menu",
        [
          ["APPLY","APPLY"],
          ["VIEW","VIEW"],
          ["PROFILE","PROFILE"],
          ["TICKET","TICKET"]
        ]
      );

    }

    res.sendStatus(200);

  } catch (e) {

    console.log(e);
    res.sendStatus(200);

  }

});



// ================= SEND =================

async function sendButtons(pid,to,body,buttons){

  return axios.post(
    `https://graph.facebook.com/v23.0/${pid}/messages`,
    {
      messaging_product:"whatsapp",
      to,
      type:"interactive",
      interactive:{
        type:"button",
        body:{text:body},
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
  console.log("HR SIMPLE RUNNING");
});
