
import WebSocket from 'ws';
import { words } from './wordList.js';

export const rooms = {};

export function broadcastToRoom(sala, data, excludeWs = null) {
    sala.players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN && p.ws !== excludeWs) {
            p.ws.send(JSON.stringify(data));
        }
    });
}

export function findRoomBySocket(ws) {
    for (const code in rooms) {
        const sala = rooms[code];
        const idx = sala.players.findIndex(p => p.ws === ws);
        if (idx !== -1) {
            return { roomCode: code, roomObj: sala, playerIndex: idx };
        }
    }
    return null;
}

export function nextRoundInRoom(code) {
    const sala = rooms[code];
    if (!sala) return;

    if (sala.players.length < 2) {
        sala.gameActive = false;
        broadcastToRoom(sala, { type: 'waiting' });
        return;
    }

    sala.round += 1;
    sala.attempts = [];
    sala.currentDrawerIdx = (sala.currentDrawerIdx + 1) % sala.players.length;
    sala.word = words[Math.floor(Math.random() * words.length)];

    broadcastToRoom(sala, {
        type: 'newRound',
        drawer: sala.players[sala.currentDrawerIdx].name,
        leaderboard: sala.leaderboard,
        attempts: sala.attempts,
        round: sala.round,
        word: null
    });

    const drawerWs = sala.players[sala.currentDrawerIdx].ws;
    drawerWs.send(JSON.stringify({
        type: 'yourTurn',
        word: sala.word
    }));
}

export function checkWinnerInRoom(code) {
    const sala = rooms[code];
    if (!sala) return false;

    for (const nome in sala.leaderboard) {
        if (sala.leaderboard[nome] >= 10) {
            broadcastToRoom(sala, {
                type: 'gameOver',
                winner: nome,
                leaderboard: sala.leaderboard
            });
            sala.gameActive = false;
            return true;
        }
    }
    return false;
}
