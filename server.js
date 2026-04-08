const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// 🔥 YOUR SUPABASE KEYS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// VIEW ENGINE
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


// ===================
// STATIC PAGES
// ===================

// ROUTES (CLEAN URLS)
app.get("*.html", (req, res) => {
  const clean = req.path.replace(".html", "");
  res.redirect(clean);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});


app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});


// ===================
// TIP PAGE
// ===================

app.get("/:username", async (req, res) => {

  const username = req.params.username;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!data) {
    return res.send("User not found");
  }

  res.render("tip", { user: data });
});


// ===================
// SAVE TIP
// ===================

app.post("/api/tip", async (req, res) => {

  const { creatorId, name, message, amount, payment_id } = req.body;

  await supabase.from("tips").insert({
    creator_id: creatorId,
    sender: name,
    message,
    amount,
    payment_id
  });

  res.json({ success: true });
});


// ===================

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
