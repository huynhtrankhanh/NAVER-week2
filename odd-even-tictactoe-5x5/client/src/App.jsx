import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const N = 5;
const emptyBoard = Array.from({ length: N }, () => Array(N).fill(0));

function useQuery() {
  return new URLSearchParams(window.location.search);
}

function getWsUrl(room, name) {
  const env = import.meta.env;
  const base = env.VITE_WS_URL
    ? env.VITE_WS_URL
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  const params = new URLSearchParams({ room, name });
  return `${base}?${params.toString()}`;
}

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : initialValue;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}

// Modified useLocalStorage to accept URL param priority
function useLocalStorageWithUrlOverride(key, urlValue, fallback) {
  // Prioritize URL param over localStorage
  const initialValue = urlValue || (() => {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : fallback;
  })();
  
  const [value, setValue] = useState(initialValue);
  
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  
  return [value, setValue];
}

export default function App() {
  const qs = useQuery();
  const [room, setRoom] = useLocalStorageWithUrlOverride('oe.room', qs.get('room'), 'lobby');
  const [name, setName] = useLocalStorageWithUrlOverride('oe.name', qs.get('name'), '');

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastMsg, setLastMsg] = useState('');
  const [state, setState] = useState({
    board: emptyBoard,
    gameOver: false,
    winner: null,
    players: { odd: null, even: null },
    spectatorCount: 0,
    youAre: 'spectator'
  });

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const desiredKey = useRef({ room, name });

  const canPlay = state.youAre === 'odd' || state.youAre === 'even';
  const title = 'Odd/Even Tic‑Tac‑Toe 5×5';

  const connect = useCallback(() => {
    // Update URL to reflect current room (keep "name" off the URL copy-link)
    const params = new URLSearchParams(window.location.search);
    params.set('room', room);
    window.history.replaceState({}, '', `?${params.toString()}`);

    setConnecting(true);
    const url = getWsUrl(room, name || `Guest-${Math.random().toString(36).slice(2,6)}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnecting(false);
      setConnected(true);
      setLastMsg('Connected.');
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'state') {
          setState({
            board: msg.board,
            gameOver: msg.gameOver,
            winner: msg.winner,
            players: msg.players,
            spectatorCount: msg.spectatorCount,
            youAre: msg.youAre
          });
        } else if (msg.type === 'message') {
          setLastMsg(msg.text);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      setLastMsg('Disconnected. Reconnecting…');
      // Gentle auto-reconnect (unless user changed room/name)
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        if (desiredKey.current.room === room && desiredKey.current.name === name) {
          connect();
        }
      }, 1200);
    };

    ws.onerror = () => {
      setLastMsg('Connection error.');
    };
  }, [room, name]);

  useEffect(() => {
    desiredKey.current = { room, name };
  }, [room, name]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  }, []);

  const onCellClick = (r, c) => {
    if (!canPlay || state.gameOver) return;
    send({ type: 'increment', row: r, col: c });
  };

  const onRestart = () => send({ type: 'restart' });

  const copyLink = async () => {
    try {
      const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
      await navigator.clipboard.writeText(link);
      setLastMsg('Room link copied to clipboard.');
    } catch {
      setLastMsg('Could not copy link.');
    }
  };

  const roleBadge = useMemo(() => {
    if (state.youAre === 'odd') return <span className="pill">You: <span className="text-fuchsia-300">ODD</span></span>;
    if (state.youAre === 'even') return <span className="pill">You: <span className="text-blue-300">EVEN</span></span>;
    return <span className="pill">You: Spectator</span>;
  }, [state.youAre]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight">
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {roleBadge}
          <span className="pill">Room: <span className="font-mono">{room}</span></span>
          <span className="pill">Players:
            <span className="ml-1">{state.players.odd ?? '—'} / {state.players.even ?? '—'}</span>
          </span>
          <span className="pill">Spectators: {state.spectatorCount}</span>
          <button className="btn btn-secondary" onClick={copyLink} title="Copy room link">
            Copy Room Link
          </button>
        </div>
      </header>

      {/* Controls Card */}
      <section className="card p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-sm mb-1 opacity-80">Display name</label>
            <input
              className="w-full rounded-lg bg-slate-800/70 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-fuchsia-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={32}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm mb-1 opacity-80">Room</label>
            <input
              className="w-full rounded-lg bg-slate-800/70 border border-white/10 px-3 py-2 outline-none focus:ring-2 ring-fuchsia-500"
              value={room}
              onChange={(e) => setRoom(e.target.value.replace(/[^\w\- ]/g, '').slice(0, 32))}
              placeholder="lobby"
              maxLength={32}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              className="btn btn-primary"
              onClick={() => {
                wsRef.current?.close();
                setTimeout(connect, 50);
              }}
            >
              {connecting ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              Hard Refresh
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm opacity-80">
          {lastMsg || (connected ? 'Connected.' : 'Not connected.')}
        </p>
      </section>

      {/* Board + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="card p-4 sm:p-6 lg:col-span-3">
          <Board board={state.board} onCellClick={onCellClick} disabled={!canPlay || state.gameOver} />
          {state.gameOver && (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-lg font-semibold mb-3">
                {state.winner === 'odd' ? (
                  <span><span className="text-fuchsia-300">ODD</span> player wins! 🎉</span>
                ) : (
                  <span><span className="text-blue-300">EVEN</span> player wins! 🎉</span>
                )}
              </p>
              <div className="flex justify-center">
                <button className="btn btn-primary" onClick={onRestart} disabled={!canPlay}>
                  Restart
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="card p-4 sm:p-6 lg:col-span-2">
          <h2 className="text-xl font-bold mb-3">Rules</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm opacity-90">
            <li>Board is 5×5. Every cell starts at <strong>0</strong>.</li>
            <li>Two players: <span className="text-fuchsia-300 font-semibold">Odd</span> and <span className="text-blue-300 font-semibold">Even</span>. Others spectate.</li>
            <li>Click a cell to <strong>increment by 1</strong>. No turn order; play simultaneously.</li>
            <li><span className="text-fuchsia-300 font-semibold">Odd</span> wins with a full row/column/diagonal that is <strong>non‑zero and odd</strong>.</li>
            <li><span className="text-blue-300 font-semibold">Even</span> wins with a full row/column/diagonal that is <strong>non‑zero and even</strong>.</li>
            <li>After a win the board is locked. Click <strong>Restart</strong> for a new game.</li>
          </ul>
          <div className="mt-6">
            <button className="btn btn-primary w-full sm:w-auto" onClick={onRestart} disabled={!canPlay}>
              Restart (players only)
            </button>
          </div>
          <p className="mt-3 text-sm opacity-80">
            First two people to join a room become players; additional joiners are spectators.
            If a player leaves, a spectator is automatically promoted to that seat.
          </p>
        </aside>
      </div>

      <footer className="mt-8 text-center text-xs opacity-70">
        Built with React, Vite, Tailwind, and WebSockets.
      </footer>
    </div>
  );
}

function Board({ board, onCellClick, disabled }) {
  return (
    <div className="grid grid-cols-5 gap-3 sm:gap-4">
      {board.map((row, r) =>
        row.map((val, c) => {
          const cls =
            val === 0 ? 'grid-cell-base grid-cell-zero' :
            val % 2 === 0 ? 'grid-cell-base grid-cell-even' :
            'grid-cell-base grid-cell-odd';
          return (
            <button
              key={`${r}-${c}`}
              className={`${cls} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => onCellClick(r, c)}
              disabled={disabled}
              aria-label={`Cell ${r + 1},${c + 1} value ${val}`}
            >
              {val}
            </button>
          );
        })
      )}
    </div>
  );
}
