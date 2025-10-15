import http from 'http';
import path from 'path';
import url from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';

// Embedded static files - these will be replaced during build (base64 encoded)
const INDEX_HTML = Buffer.from('__INDEX_HTML_BASE64__', 'base64').toString('utf-8');
const CSS_CONTENT = Buffer.from('__CSS_CONTENT_BASE64__', 'base64').toString('utf-8');
const JS_CONTENT = Buffer.from('__JS_CONTENT_BASE64__', 'base64').toString('utf-8');
const CSS_FILENAME = '__CSS_FILENAME__';
const JS_FILENAME = '__JS_FILENAME__';

const PORT = process.env.PORT || 3001;
const N = 5;

// ----- Utilities -----
const makeBoard = () => Array.from({ length: N }, () => Array(N).fill(0));

function lineParity(line) {
  if (line.some((v) => v === 0)) return null;
  const allOdd = line.every((v) => v % 2 === 1);
  if (allOdd) return 'odd';
  const allEven = line.every((v) => v % 2 === 0);
  if (allEven) return 'even';
  return null;
}

function checkWinner(board) {
  for (let i = 0; i < N; i++) {
    const rowP = lineParity(board[i]);
    if (rowP) return rowP;
    const col = board.map((r) => r[i]);
    const colP = lineParity(col);
    if (colP) return colP;
  }
  const d1 = board.map((r, i) => r[i]);
  const d2 = board.map((r, i) => r[N - 1 - i]);
  const d1p = lineParity(d1);
  if (d1p) return d1p;
  const d2p = lineParity(d2);
  if (d2p) return d2p;
  return null;
}

const sanitizeStr = (s, fallback) => {
  const t = (s || '').toString().trim();
  if (!t) return fallback;
  return t.slice(0, 32).replace(/[^\w\- ]/g, '');
};

const randomId = () => Math.random().toString(36).slice(2, 10);

// ----- Room state -----
const rooms = new Map();

function createRoom(id) {
  return {
    id,
    board: makeBoard(),
    gameOver: false,
    winner: null,
    clients: new Map()
  };
}

function publicState(room) {
  const players = { odd: null, even: null };
  let spectatorCount = 0;
  for (const [_ws, c] of room.clients) {
    if (c.role === 'odd') players.odd = c.name;
    else if (c.role === 'even') players.even = c.name;
    else spectatorCount++;
  }
  return {
    board: room.board,
    gameOver: room.gameOver,
    winner: room.winner,
    players,
    spectatorCount
  };
}

function youAre(room, ws) {
  const c = room.clients.get(ws);
  return c ? c.role : 'spectator';
}

function sendFullState(room) {
  for (const ws of room.clients.keys()) {
    safeSend(ws, {
      type: 'state',
      ...publicState(room),
      youAre: youAre(room, ws)
    });
  }
}

function safeSend(ws, obj) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {}
  }
}

function assignRoleForNew(room) {
  let hasOdd = false;
  let hasEven = false;
  for (const [_ws, c] of room.clients) {
    if (c.role === 'odd') hasOdd = true;
    if (c.role === 'even') hasEven = true;
  }
  if (!hasOdd) return 'odd';
  if (!hasEven) return 'even';
  return 'spectator';
}

function tryPromoteSpectator(room, roleToFill) {
  const candidates = [...room.clients.entries()]
    .filter(([_, c]) => c.role === 'spectator')
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  if (candidates.length) {
    candidates[0][1].role = roleToFill;
    return candidates[0][1].name;
  }
  return null;
}

// ----- Express + WS setup with embedded files -----
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve embedded static files
app.get(`/assets/${CSS_FILENAME}`, (_req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.send(CSS_CONTENT);
});

app.get(`/assets/${JS_FILENAME}`, (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(JS_CONTENT);
});

app.get('*', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(INDEX_HTML);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Ping/pong keepalive
const heartbeat = () => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
};
const interval = setInterval(heartbeat, 30000);
wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const { query } = url.parse(req.url, true);
  const roomId = sanitizeStr(query.room, 'lobby') || 'lobby';
  const name = sanitizeStr(query.name, 'Guest-' + randomId());

  let room = rooms.get(roomId);
  if (!room) {
    room = createRoom(roomId);
    rooms.set(roomId, room);
  }

  const role = assignRoleForNew(room);
  const client = { id: randomId(), name, role, joinedAt: Date.now() };
  room.clients.set(ws, client);

  safeSend(ws, {
    type: 'message',
    text:
      role === 'spectator'
        ? `Joined ${roomId} as Spectator (players are ${publicState(room).players.odd ?? '—'} and ${publicState(room).players.even ?? '—'}).`
        : `Joined ${roomId} as ${role.toUpperCase()} player.`
  });

  sendFullState(room);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!rooms.has(roomId)) return;
    const r = rooms.get(roomId);
    const me = r.clients.get(ws);
    if (!me) return;

    if (msg.type === 'increment') {
      if (r.gameOver) {
        safeSend(ws, { type: 'message', text: 'Game is over. Press Restart to begin a new round.' });
        return;
      }
      if (me.role !== 'odd' && me.role !== 'even') return;
      const { row, col } = msg;
      if (
        Number.isInteger(row) &&
        Number.isInteger(col) &&
        row >= 0 && row < N &&
        col >= 0 && col < N
      ) {
        r.board[row][col] = (r.board[row][col] || 0) + 1;
        const winner = checkWinner(r.board);
        if (winner) {
          r.gameOver = true;
          r.winner = winner;
        }
        sendFullState(r);
      }
    }

    if (msg.type === 'restart') {
      if (me.role === 'odd' || me.role === 'even') {
        r.board = makeBoard();
        r.gameOver = false;
        r.winner = null;
        sendFullState(r);
      } else {
        safeSend(ws, { type: 'message', text: 'Only players can restart.' });
      }
    }
  });

  ws.on('close', () => {
    const r = rooms.get(roomId);
    if (!r) return;
    const leaving = r.clients.get(ws);
    r.clients.delete(ws);

    if (leaving && (leaving.role === 'odd' || leaving.role === 'even')) {
      const filledBy = tryPromoteSpectator(r, leaving.role);
      if (filledBy) {
        for (const sock of r.clients.keys()) {
          safeSend(sock, { type: 'message', text: `${filledBy} is now ${leaving.role.toUpperCase()} player.` });
        }
      }
    }

    if (r.clients.size === 0) {
      rooms.delete(roomId);
    } else {
      sendFullState(r);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`WebSocket path: ws://localhost:${PORT}/ws`);
});
