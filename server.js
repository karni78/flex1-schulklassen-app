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
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_filename TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS for_you (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
try { db.exec("ALTER TABLE events ADD COLUMN time TEXT NOT NULL DEFAULT ''"); } catch (e) {}

if (!db.prepare('SELECT id FROM info WHERE id=1').get()) {
  db.prepare('INSERT INTO info (id,title,body) VALUES (1,?,?)').run('Schön, dass ihr da seid!','Hier findet ihr alles Wichtige rund um unsere Klasse – aktuell, gemeinsam und an einem Ort.');
}
if (db.prepare('SELECT COUNT(*) AS n FROM news').get().n === 0) {
  const addNews=db.prepare('INSERT INTO news(date,title,body,image_filename) VALUES(?,?,?,?)');
  addNews.run('01.09.2026','Herzlich willkommen in der Flex 1! 💛','Wir freuen uns auf ein spannendes, erfolgreiches und schönes Schuljahr mit euch!',null);
  addNews.run('05.09.2026','Herbstzeit','Bitte denkt in den nächsten Wochen an wetterfeste Kleidung.',null);
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

app.get('/api/events',requireLogin,(req,res)=>res.json(db.prepare('SELECT * FROM events ORDER BY date ASC, id ASC').all()));
app.post('/api/events',requireLogin,(req,res)=>{
  const date=String(req.body?.date||'').trim().slice(0,10);
  const time=String(req.body?.time||'').trim().slice(0,5);
  const title=String(req.body?.title||'').trim().slice(0,120);
  const details=String(req.body?.details||'').trim().slice(0,250);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!title) return res.status(400).json({error:'Datum und Überschrift erforderlich'});
  if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return res.status(400).json({error:'Ungültige Uhrzeit'});
  const result=db.prepare('INSERT INTO events(date,time,title,details) VALUES(?,?,?,?)').run(date,time,title,details);
  res.json({ok:true,id:result.lastInsertRowid});
});
app.delete('/api/events/:id',requireAdmin,(req,res)=>{ db.prepare('DELETE FROM events WHERE id=?').run(req.params.id); res.json({ok:true}); });

app.get('/api/news',requireLogin,(req,res)=>res.json(db.prepare('SELECT * FROM news ORDER BY date DESC, id DESC').all()));
app.put('/api/news/:id',requireAdmin,upload.single('image'),(req,res)=>{
  const existing=db.prepare('SELECT * FROM news WHERE id=?').get(req.params.id);
  if(!existing) return res.status(404).json({error:'Neuigkeit nicht gefunden'});
  const date=String(req.body?.date||existing.date).trim().slice(0,30);
  const title=String(req.body?.title||'').trim().slice(0,120);
  const body=String(req.body?.body||'').trim().slice(0,1000);
  if(!title||!body) { if(req.file) try{fs.unlinkSync(req.file.path)}catch{}; return res.status(400).json({error:'Überschrift und Text erforderlich'}); }
  let image=existing.image_filename;
  if(req.file){
    image=req.file.filename;
    if(existing.image_filename) try{fs.unlinkSync(path.join(UPLOADS,existing.image_filename))}catch{}
  }
  db.prepare('UPDATE news SET date=?,title=?,body=?,image_filename=? WHERE id=?').run(date,title,body,image,req.params.id);
  res.json({ok:true});
});

app.post('/api/news',requireAdmin,upload.single('image'),(req,res)=>{
  const date=String(req.body?.date||'').trim().slice(0,30);
  const title=String(req.body?.title||'').trim().slice(0,120);
  const body=String(req.body?.body||'').trim().slice(0,1000);
  if(!title||!body){ if(req.file) try{fs.unlinkSync(req.file.path)}catch{}; return res.status(400).json({error:'Überschrift und Text erforderlich'}); }
  db.prepare('INSERT INTO news(date,title,body,image_filename) VALUES(?,?,?,?)').run(date,title,body,req.file?req.file.filename:null);
  res.json({ok:true});
});
app.delete('/api/news/:id',requireAdmin,(req,res)=>{
  const n=db.prepare('SELECT * FROM news WHERE id=?').get(req.params.id);
  if(n?.image_filename) try{fs.unlinkSync(path.join(UPLOADS,n.image_filename))}catch{}
  db.prepare('DELETE FROM news WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.get('/api/for-you',requireLogin,(req,res)=>res.json(db.prepare('SELECT * FROM for_you ORDER BY id DESC LIMIT 30').all()));
app.post('/api/for-you',requireLogin,(req,res)=>{
  const name=String(req.body?.name||'').trim().slice(0,40);
  const text=String(req.body?.text||'').trim().slice(0,500);
  if(!name||!text) return res.status(400).json({error:'Name und Nachricht erforderlich'});
  db.prepare('INSERT INTO for_you(name,text) VALUES(?,?)').run(name,text);
  res.json({ok:true});
});

app.delete('/api/for-you/:id',requireAdmin,(req,res)=>{ db.prepare('DELETE FROM for_you WHERE id=?').run(req.params.id); res.json({ok:true}); });

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
app.post('/api/files',requireLogin,upload.single('file'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Keine Datei'});
  const requestedKind=String(req.body.kind||'').toLowerCase();
  const isImage=req.file.mimetype.startsWith('image/');
  const isDocument=[
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ].includes(req.file.mimetype);
  let kind=isImage?'image':isDocument?'document':null;
  if(requestedKind==='image' && !isImage) kind=null;
  if(requestedKind==='document' && !isDocument) kind=null;
  if(!kind){ try{fs.unlinkSync(req.file.path);}catch{} return res.status(400).json({error:'Dieser Dateityp ist hier nicht erlaubt'}); }
  const title=String(req.body.title||'').trim().slice(0,120);
  if(!title){ try{fs.unlinkSync(req.file.path);}catch{} return res.status(400).json({error:'Eine Überschrift ist erforderlich'}); }
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
