const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const APP_PASSWORD = process.env.APP_PASSWORD;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === 'production' && (!APP_PASSWORD || !ADMIN_PASSWORD || !SESSION_SECRET)) {
  throw new Error('APP_PASSWORD, ADMIN_PASSWORD und SESSION_SECRET müssen in production gesetzt sein.');
}
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const db = new Database(path.join(ROOT, 'school.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  reaction TEXT NOT NULL,
  UNIQUE(message_id, session_id, reaction)
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS info (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL,
  body TEXT NOT NULL
);
`);
if (!db.prepare('SELECT id FROM info WHERE id=1').get()) {
  db.prepare('INSERT INTO info (id,title,body) VALUES (1,?,?)').run('Willkommen in der Schulklassen-App','Hier findet ihr wichtige Informationen, Termine, Bilder und Dokumente rund um die Klasse.');
}

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

function requireLogin(req,res,next){ if(req.session.loggedIn) return next(); res.status(401).json({error:'Nicht angemeldet'}); }
function requireAdmin(req,res,next){ if(req.session.admin) return next(); res.status(403).json({error:'Adminzugang erforderlich'}); }

app.get('/health', (req,res)=>res.json({ok:true, app:'Flex 1', time:new Date().toISOString()}));
app.get('/login', (req,res)=>res.sendFile(path.join(ROOT,'public','login.html')));
app.post('/api/login',(req,res)=>{
  const { password } = req.body || {};
  if(password === APP_PASSWORD){ req.session.loggedIn=true; req.session.admin=false; req.session.userId=req.sessionID; return res.json({ok:true}); }
  if(password === ADMIN_PASSWORD){ req.session.loggedIn=true; req.session.admin=true; req.session.userId=req.sessionID; return res.json({ok:true,admin:true}); }
  res.status(401).json({error:'Falsches Passwort'});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({loggedIn:!!req.session.loggedIn,admin:!!req.session.admin}));

app.get('/',(req,res)=>{ if(!req.session.loggedIn) return res.redirect('/login'); res.sendFile(path.join(ROOT,'public','index.html')); });
app.use('/uploads', requireLogin, express.static(UPLOADS, { maxAge: '1h' }));

app.get('/api/info',requireLogin,(req,res)=>res.json(db.prepare('SELECT title,body FROM info WHERE id=1').get()));
app.put('/api/info',requireAdmin,(req,res)=>{
  const {title,body}=req.body||{};
  db.prepare('UPDATE info SET title=?, body=? WHERE id=1').run(title||'Informationen',body||'');
  res.json({ok:true});
});

app.get('/api/messages',requireLogin,(req,res)=>{
  const rows=db.prepare(`SELECT m.*, COUNT(r.id) AS reaction_count,
    SUM(CASE WHEN r.reaction='👍' THEN 1 ELSE 0 END) AS thumbs,
    SUM(CASE WHEN r.reaction='❤️' THEN 1 ELSE 0 END) AS hearts,
    SUM(CASE WHEN r.reaction='😂' THEN 1 ELSE 0 END) AS laughs,
    SUM(CASE WHEN r.reaction='👏' THEN 1 ELSE 0 END) AS claps
    FROM messages m LEFT JOIN reactions r ON r.message_id=m.id
    GROUP BY m.id ORDER BY m.id DESC LIMIT 100`).all();
  res.json(rows.reverse());
});
app.post('/api/messages',requireLogin,(req,res)=>{
  const name=String(req.body?.name||'').trim().slice(0,40);
  const text=String(req.body?.text||'').trim().slice(0,1000);
  if(!name||!text) return res.status(400).json({error:'Name und Nachricht erforderlich'});
  const result=db.prepare('INSERT INTO messages(name,text) VALUES(?,?)').run(name,text);
  res.json({ok:true,id:result.lastInsertRowid});
});
app.post('/api/messages/:id/reactions',requireLogin,(req,res)=>{
  const allowed=['👍','❤️','😂','👏'];
  const reaction=req.body?.reaction;
  if(!allowed.includes(reaction)) return res.status(400).json({error:'Ungültige Reaktion'});
  try { db.prepare('INSERT INTO reactions(message_id,session_id,reaction) VALUES(?,?,?)').run(req.params.id,req.sessionID,reaction); }
  catch(e){ db.prepare('DELETE FROM reactions WHERE message_id=? AND session_id=? AND reaction=?').run(req.params.id,req.sessionID,reaction); }
  res.json({ok:true});
});

app.get('/api/files',requireLogin,(req,res)=>res.json(db.prepare('SELECT * FROM files ORDER BY id DESC').all()));
app.post('/api/files',requireAdmin,upload.single('file'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Keine Datei'});
  const kind=req.file.mimetype.startsWith('image/')?'image':'document';
  const title=String(req.body.title||req.file.originalname).slice(0,120);
  db.prepare('INSERT INTO files(title,filename,original_name,kind) VALUES(?,?,?,?)').run(title,req.file.filename,req.file.originalname,kind);
  res.json({ok:true});
});
app.delete('/api/files/:id',requireAdmin,(req,res)=>{
  const f=db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if(f){ try{fs.unlinkSync(path.join(UPLOADS,f.filename));}catch{} db.prepare('DELETE FROM files WHERE id=?').run(req.params.id); }
  res.json({ok:true});
});

app.use(express.static(path.join(ROOT,'public')));
app.listen(PORT, HOST, ()=>console.log(`Flex 1 läuft auf ${HOST}:${PORT}`));
