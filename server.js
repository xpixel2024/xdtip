const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// 🔥 SUPABASE
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
// CLEAN .html URL
// ===================
app.get(/\.html$/, (req, res) => {
  const clean = req.path.replace(".html", "");
  res.redirect(clean);
});


// ===================
// STATIC ROUTES
// ===================

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
// SAVE TIP API
// ===================

app.post("/api/tip", async (req, res) => {
    const { userId, name, message, amount, payment_id } = req.body;

    // This is where the magic happens
    const { data, error } = await supabase
        .from("tips") // Make sure your table is named 'tips'
        .insert([
            {
                user_id: userId,        // Column in Supabase
                sender_name: name,      // Column in Supabase
                message: message,       // Column in Supabase
                amount: amount,         // Column in Supabase
                payment_id: payment_id  // Column in Supabase
            }
        ]);

    if (error) {
        console.error("Supabase Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true });
});


// ===================
// USERNAME ROUTE (ONLY ONE! 🔥)
// ===================

app.get("/:username", async (req, res) => {
  try {
    const username = req.params.username;

    // 🚫 block system routes
    const blocked = ["login", "dashboard", "admin", "api"];

    if (blocked.includes(username)) {
      return res.redirect("/");
    }

    // 🔥 FIX: use ilike (case-insensitive)
    const { data } = await supabase
      .from("users")
      .select("*")
      .ilike("username", username)
      .maybeSingle();

    console.log("Searching username:", username);
    console.log("DB result:", data);

    if (!data) {
      return res.send("User not found");
    }

    res.render("tip", { user: data });

  } catch (err) {
    console.error(err);
    res.send("Server error");
  }
});


// ===================

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
