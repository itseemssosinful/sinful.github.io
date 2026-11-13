const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");

/* ---------- storage (one JSON file) ---------- */

let db = { users: [], posts: [], sessions: {} };
if (fs.existsSync(DATA_FILE)) {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
}
function saveDb() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function newId() {
  return crypto.randomBytes(8).toString("hex");
}

/* ---------- email ---------- */

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
} else {
  console.log("SMTP not configured: emails will be printed here instead of sent.");
}

async function sendMail(to, subject, text) {
  if (!transporter) {
    console.log(`\n[email not sent - SMTP not configured]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text
    });
  } catch (e) {
    console.error("Email failed for", to, "-", e.message);
  }
}

/* ---------- sessions ---------- */

const SESSION_DAYS = 30;

function hashToken(t) {
  return crypto.createHash("sha256").update(t).digest("hex");
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions[hashToken(token)] = { userId, expires: Date.now() + SESSION_DAYS * 86400000 };
  saveDb();
  const secure = SITE_URL.startsWith("https") ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`
  );
}
function endSession(req, res) {
  const t = parseCookies(req).sid;
  if (t) {
    delete db.sessions[hashToken(t)];
    saveDb();
  }
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}
function authUser(req) {
  const t = parseCookies(req).sid;
  if (!t) return null;
  const s = db.sessions[hashToken(t)];
  if (!s) return null;
  if (s.expires < Date.now()) {
    delete db.sessions[hashToken(t)];
    return null;
  }
  return db.users.find((u) => u.id === s.userId) || null;
}

/* ---------- helpers ---------- */

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || "",
    email: u.email || "",
    avatar: u.avatar || "",
    owner: !!u.owner,
    subscribed: !!u.subscribed
  };
}
function authorName(userId) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return "Former owner";
  return u.displayName || u.username;
}
function publicPost(p) {
  return { id: p.id, title: p.title, body: p.body, date: p.date, author: authorName(p.authorId) };
}
function usernameTaken(name, exceptId) {
  return db.users.some(
    (u) => u.id !== exceptId && u.username.toLowerCase() === name.toLowerCase()
  );
}
function validUsername(n) {
  return typeof n === "string" && /^[A-Za-z0-9_.-]{3,30}$/.test(n);
}
function validEmail(e) {
  return typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// very small login throttle: 10 failures per 15 minutes per IP + username
const failures = new Map();
function throttleKey(req, username) {
  return req.ip + "|" + String(username).toLowerCase();
}
function isThrottled(key) {
  const f = failures.get(key);
  return f && f.count >= 10 && Date.now() - f.first < 15 * 60000;
}
function recordFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first >= 15 * 60000) failures.set(key, { count: 1, first: Date.now() });
  else f.count++;
}

/* ---------- app ---------- */

const app = express();
app.use(express.json({ limit: "1mb" }));
// All routes live on one router so the blog answers both at /blog/ (inside
// your site) and at / (when run on its own).
const router = express.Router();
router.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Please log in." });
  req.user = user;
  next();
}

router.get("/api/me", (req, res) => {
  const user = authUser(req);
  res.json({ user: user ? publicUser(user) : null });
});

router.post("/api/signup", async (req, res) => {
  const { username, password } = req.body || {};
  if (!validUsername(username))
    return res.status(400).json({ error: "Username must be 3-30 characters: letters, numbers, . _ -" });
  if (typeof password !== "string" || password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (usernameTaken(username)) return res.status(400).json({ error: "That username is taken." });

  const user = {
    id: newId(),
    username,
    displayName: "",
    email: "",
    avatar: "",
    passwordHash: await bcrypt.hash(password, 10),
    // The very first account becomes the website owner.
    owner: db.users.length === 0,
    subscribed: false,
    created: Date.now()
  };
  db.users.push(user);
  saveDb();
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const key = throttleKey(req, username || "");
  if (isThrottled(key)) return res.status(429).json({ error: "Too many attempts. Try again later." });
  const user = db.users.find(
    (u) => typeof username === "string" && u.username.toLowerCase() === username.toLowerCase()
  );
  const ok = user && typeof password === "string" && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    recordFailure(key);
    return res.status(401).json({ error: "Wrong username or password." });
  }
  failures.delete(key);
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post("/api/logout", (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

router.get("/api/posts", (req, res) => {
  res.json({ posts: db.posts.slice().reverse().map(publicPost) });
});

router.post("/api/posts", requireLogin, (req, res) => {
  if (!req.user.owner) return res.status(403).json({ error: "Only the owner can post." });
  const title = String((req.body || {}).title || "").trim();
  const body = String((req.body || {}).body || "").trim();
  if (!title || !body) return res.status(400).json({ error: "Add a title and a message." });
  if (title.length > 200 || body.length > 20000)
    return res.status(400).json({ error: "That post is too long." });

  const post = { id: newId(), title, body, date: Date.now(), authorId: req.user.id };
  db.posts.push(post);
  saveDb();

  const recipients = db.users.filter((u) => u.subscribed && u.email);
  res.json({ post: publicPost(post), emailed: recipients.length });

  // send in the background, one email each so addresses are never shared
  (async () => {
    for (const u of recipients) {
      await sendMail(
        u.email,
        `New blog update: ${title}`,
        `${title}\n\n${body}\n\n---\nRead it on the site: ${SITE_URL}\nTo stop these emails, untick the email box on the site.`
      );
    }
  })();
});

router.put("/api/profile", requireLogin, (req, res) => {
  const { username, displayName, email, avatar } = req.body || {};
  const u = req.user;

  if (username !== undefined) {
    if (!validUsername(username))
      return res.status(400).json({ error: "Username must be 3-30 characters: letters, numbers, . _ -" });
    if (usernameTaken(username, u.id)) return res.status(400).json({ error: "That username is taken." });
    u.username = username;
  }
  if (displayName !== undefined) {
    const d = String(displayName).trim();
    if (d.length > 50) return res.status(400).json({ error: "Display name is too long (50 max)." });
    u.displayName = d;
  }
  if (email !== undefined) {
    const e = String(email).trim();
    if (e && !validEmail(e)) return res.status(400).json({ error: "That email address doesn't look right." });
    u.email = e;
    if (!e) u.subscribed = false;
  }
  if (avatar !== undefined) {
    if (avatar && !(typeof avatar === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(avatar) && avatar.length < 400000))
      return res.status(400).json({ error: "That picture isn't supported or is too large." });
    u.avatar = avatar || "";
  }
  saveDb();
  res.json({ user: publicUser(u) });
});

router.post("/api/subscribe", requireLogin, (req, res) => {
  const want = !!(req.body || {}).subscribed;
  if (want && !req.user.email)
    return res.status(400).json({ error: "Add an email address on your profile page first." });
  req.user.subscribed = want;
  saveDb();
  res.json({ user: publicUser(req.user) });
});

router.delete("/api/account", requireLogin, async (req, res) => {
  const { password } = req.body || {};
  const ok = typeof password === "string" && (await bcrypt.compare(password, req.user.passwordHash));
  if (!ok) return res.status(401).json({ error: "Wrong password." });
  const id = req.user.id;
  db.users = db.users.filter((u) => u.id !== id);
  for (const k of Object.keys(db.sessions)) {
    if (db.sessions[k].userId === id) delete db.sessions[k];
  }
  saveDb();
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.json({ ok: true });
});

app.use("/blog", router);
app.use("/", router);

app.listen(PORT, () => {
  console.log(`Blog running at ${SITE_URL}/blog/ (and ${SITE_URL}/)`);
});
