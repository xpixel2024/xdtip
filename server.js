const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// 1. DYNAMIC PORT FOR RENDER (CRITICAL)
const PORT = process.env.PORT || 3000;

// 🔥 SUPABASE SETUP
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// MIDDLEWARE
app.use(express.json());
// It's good practice to add urlencoded if you ever use standard HTML forms
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, "public")));

// VIEW ENGINE
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===================
// CLEAN .html URL
// ===================
// Redirects /login.html to /login
app.get(/\.html$/, (req, res) => {
  const clean = req.path.replace(".html", "");
  res.redirect(301, clean);
});

// ===================
// STATIC ROUTES
// ===================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public/dashboard.html")));

// ===================
// SAVE TIP API
// ===================
app.post("/api/tip", async (req, res) => {
    const { username, name, message, amount, payment_id } = req.body;

    try {
        const { error } = await supabase
            .from("tips")
            .insert([
                {
                    username: username,
                    sender_name: name,
                    message: message,
                    amount: parseFloat(amount), // Ensure amount is a number
                    payment_id: payment_id
                }
            ]);

        if (error) throw error;
        res.json({ success: true });

    } catch (err) {
        console.error("Save Tip Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===================
// USERNAME ROUTE (Dynamic Tip Page)
// ===================
app.get("/:username", async (req, res) => {
  try {
    const username = req.params.username;

    // 🚫 Block system routes
    const blocked = ["login", "dashboard", "admin", "api", "index"];
    if (blocked.includes(username.toLowerCase())) {
      return res.redirect("/");
    }

    // ilike makes it case-insensitive (e.g., /xdfunYT and /xdfunyt both work)
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .ilike("username", username)
      .maybeSingle();

    if (error || !data) {
      console.log(`User [${username}] not found.`);
      return res.status(404).send("User not found");
    }

    res.render("tip", { user: data });

  } catch (err) {
    console.error("Route Error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// ===================
// OBS ALERT SYSTEM
// ===================
app.get('/alert/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('overlay_theme, username')
            .eq('obs_token', token)
            .single();

        if (error || !user) {
            return res.status(404).send("INVALID OBS TOKEN");
        }

        // Determine which file to send based on theme
        let fileToSend = 'alert.html'; 
        if (user.overlay_theme === 'neon') fileToSend = 'alert_neon.html';
        if (user.overlay_theme === 'minimal') fileToSend = 'alert_minimal.html';
        if (user.overlay_theme === 'vip') fileToSend = 'alert_vip.html';
        if (user.overlay_theme === 'basic') fileToSend = 'alert_basic.html';
        if (user.overlay_theme === 'frost') fileToSend = 'alert_frost.html';

        res.sendFile(path.join(__dirname, 'public', fileToSend));

    } catch (err) {
        console.error("Overlay Error:", err);
        res.status(500).send("SERVER ERROR");
    }
});

// ==========================
// M. TEST ALERT (Supabase Broadcast)
// ==========================
app.post('/test-alert', authenticateToken, async (req, res) => {
    const username = req.user.username;
    
    // 1. Check if the dashboard sent specific data (for Replay)
    const { tipper, amount, message } = req.body;

    // 2. Use that data, OR fallback to "Test Bot" if empty
    const alertData = {
        tipper: tipper || "Test Commander",
        amount: amount || 69,
        message: message || "System uplink successful! 🚀"
    };

    // 3. Connect to this specific user's walkie-talkie channel
    const roomName = `alert-room-${username.toLowerCase()}`;
    const channel = supabase.channel(roomName);
    
    // 4. Subscribe, Broadcast the fake tip, and disconnect
    channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            await channel.send({
                type: 'broadcast',
                event: 'test-tip',
                payload: alertData
            });
            
            // Instantly delete the channel connection so the server doesn't lag
            supabase.removeChannel(channel);
        }
    });

    console.log(`📡 Broadcast sent to OBS for ${username}: ${alertData.tipper}`);
    res.json({ success: true, message: "Test Alert Broadcasted!" });
});

// ===================
// START SERVER
// ===================
app.listen(PORT, () => {
  console.log(`🚀 Terminal Online: http://localhost:${PORT}`);
});
