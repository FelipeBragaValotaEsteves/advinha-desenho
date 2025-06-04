import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';

import { __dirname } from './utils.js';
import {
    rooms,
    broadcastToRoom,
    findRoomBySocket,
    nextRoundInRoom,
    checkWinnerInRoom
} from './roomManager.js';

const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, '../public', (req.url === '/' ? 'index.html' : req.url));
    const ext = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css'
    }[ext] || 'text/plain';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Arquivo não encontrado');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
    ws.on('message', message => {
        let data;
        try {
            data = JSON.parse(message);
        } catch {
            return;
        }

        if (data.type === 'create') {
            const nome = data.name.trim();
            let code;
            do {
                code = Math.random().toString(36).substring(2, 7).toUpperCase();
            } while (rooms[code]);

            rooms[code] = {
                host: nome,
                hostWs: ws,
                players: [{ name: nome, ws }],
                leaderboard: { [nome]: 0 },
                currentDrawerIdx: -1,
                word: '',
                round: 0,
                attempts: [],
                gameActive: false
            };

            ws.send(JSON.stringify({ type: 'roomCreated', room: code, host: true }));
            broadcastToRoom(rooms[code], {
                type: 'roomUpdate',
                players: rooms[code].players.map(p => p.name),
                host: rooms[code].host
            });
            return;
        }

        if (data.type === 'joinRoom') {
            const nome = data.name.trim();
            const code = data.room.trim().toUpperCase();
            const sala = rooms[code];

            if (!sala) {
                ws.send(JSON.stringify({ type: 'error', message: 'Sala não existe.' }));
                return;
            }
            if (sala.gameActive) {
                ws.send(JSON.stringify({ type: 'error', message: 'Jogo já em andamento nesta sala.' }));
                return;
            }
            if (sala.players.find(p => p.name === nome)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Nome já em uso nesta sala.' }));
                return;
            }

            sala.players.push({ name: nome, ws });
            sala.leaderboard[nome] = 0;

            ws.send(JSON.stringify({ type: 'joinedRoom', room: code, host: false }));
            broadcastToRoom(sala, {
                type: 'roomUpdate',
                players: sala.players.map(p => p.name),
                host: sala.host
            });
            return;
        }

        if (data.type === 'startGame') {
            const code = data.room;
            const sala = rooms[code];

            if (!sala) {
                ws.send(JSON.stringify({ type: 'error', message: 'Sala não encontrada.' }));
                return;
            }
            if (sala.hostWs !== ws) {
                ws.send(JSON.stringify({ type: 'error', message: 'Apenas o host pode iniciar a partida.' }));
                return;
            }
            if (sala.players.length < 2) {
                ws.send(JSON.stringify({ type: 'error', message: 'Pelo menos 2 jogadores são necessários.' }));
                return;
            }

            sala.gameActive = true;
            sala.currentDrawerIdx = Math.floor(Math.random() * sala.players.length);
            sala.round = 0;
            sala.attempts = [];
            sala.players.forEach(p => sala.leaderboard[p.name] = 0);

            broadcastToRoom(sala, { type: 'gameStarted' });
            nextRoundInRoom(code);
            return;
        }

        if (data.type === 'draw') {
            const info = findRoomBySocket(ws);
            if (!info) return;
            const { roomCode, roomObj } = info;
            const sala = roomObj;

            if (sala.players[sala.currentDrawerIdx].ws === ws) {
                broadcastToRoom(sala, { type: 'draw', drawing: data.drawing }, ws);
            }
            return;
        }

        if (data.type === 'guess') {
            const info = findRoomBySocket(ws);
            if (!info) return;
            const { roomCode, roomObj } = info;
            const sala = roomObj;

            sala.attempts.push({ name: data.name, guess: data.guess });
            broadcastToRoom(sala, { type: 'attempts', attempts: sala.attempts });

            if (data.guess.toLowerCase() === sala.word.toLowerCase()) {
                sala.leaderboard[data.name] += 2;
                const drawerName = sala.players[sala.currentDrawerIdx].name;
                sala.leaderboard[drawerName] += 1;

                broadcastToRoom(sala, {
                    type: 'correct',
                    name: data.name,
                    word: sala.word,
                    leaderboard: sala.leaderboard
                });

                if (!checkWinnerInRoom(roomCode)) {
                    setTimeout(() => nextRoundInRoom(roomCode), 2000);
                }
            }
            return;
        }

        if (data.type === 'restartGame') {
            const code = data.room;
            const sala = rooms[code];

            if (!sala) {
                ws.send(JSON.stringify({ type: 'error', message: 'Sala não encontrada.' }));
                return;
            }
            if (sala.hostWs !== ws) {
                ws.send(JSON.stringify({ type: 'error', message: 'Apenas o host pode reiniciar a partida.' }));
                return;
            }
            if (sala.players.length < 2) {
                ws.send(JSON.stringify({ type: 'error', message: 'Pelo menos 2 jogadores são necessários.' }));
                return;
            }

            sala.gameActive = true;
            sala.round = 0;
            sala.attempts = [];
            sala.players.forEach(p => sala.leaderboard[p.name] = 0);
            sala.currentDrawerIdx = Math.floor(Math.random() * sala.players.length);

            broadcastToRoom(sala, { type: 'gameStarted' });
            nextRoundInRoom(code);
            return;
        }

        if (data.type === 'leaveRoom') {
            const info = findRoomBySocket(ws);
            if (!info) return;
            const { roomCode, roomObj, playerIndex } = info;
            const sala = roomObj;
            const nomeSaiu = sala.players[playerIndex].name;

            if (sala.hostWs === ws) {
                ws.send(JSON.stringify({ type: 'error', message: 'Host não pode sair sem reiniciar ou fechar a sala.' }));
                return;
            }

            sala.players.splice(playerIndex, 1);
            delete sala.leaderboard[nomeSaiu];

            ws.send(JSON.stringify({ type: 'leftRoom' }));

            broadcastToRoom(sala, {
                type: 'roomUpdate',
                players: sala.players.map(p => p.name),
                host: sala.host
            });

            return;
        }

        ws.on('close', () => {
            const info = findRoomBySocket(ws);
            if (!info) return;

            const { roomCode, roomObj, playerIndex } = info;
            const sala = roomObj;
            const leavingPlayer = sala.players[playerIndex];
            const leavingName = leavingPlayer.name;
            const wasHost = (sala.hostWs === ws);
            const wasDrawer = (sala.players[sala.currentDrawerIdx]?.ws === ws);

            sala.players.splice(playerIndex, 1);
            delete sala.leaderboard[leavingName];

            if (sala.players.length === 0) {
                delete rooms[roomCode];
                return;
            }

            if (wasHost && !sala.gameActive) {
                sala.host = sala.players[0].name;
                sala.hostWs = sala.players[0].ws;
            }

            if (sala.gameActive && wasDrawer) {
                if (sala.players.length < 2) {
                    sala.gameActive = false;
                    broadcastToRoom(sala, { type: 'waiting' });
                } else {
                    sala.currentDrawerIdx = sala.currentDrawerIdx % sala.players.length;
                    nextRoundInRoom(roomCode);
                }
            }

            broadcastToRoom(sala, {
                type: 'roomUpdate',
                players: sala.players.map(p => p.name),
                host: sala.host
            });
        });
    });
});

server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
