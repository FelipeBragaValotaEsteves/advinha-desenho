const ws = new WebSocket(`ws://${location.host}`);
let myName = '';
let myRoom = '';
let isHost = false;
let isDrawer = false;
let canDraw = false;
let drawing = false;
let last = null;

const loginDiv = document.getElementById('login');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const errorDiv = document.getElementById('error');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const playersList = document.getElementById('playersList');
const startBtn = document.getElementById('startBtn');
const lobbyStatus = document.getElementById('lobbyStatus');

const leaderboardDiv = document.getElementById('leaderboard');
const roundInfoDiv = document.getElementById('roundInfo');
const wordHintDiv = document.getElementById('wordHint');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const attemptsDiv = document.getElementById('attempts');
const statusDiv = document.getElementById('status');
const messageBox = document.getElementById('messageBox');
const postGameActions = document.getElementById('postGameActions');
const restartBtn = document.getElementById('restartBtn');
const leaveBtn = document.getElementById('leaveBtn');

restartBtn.onclick = () => {
  ws.send(JSON.stringify({ type: 'restartGame', room: myRoom }));
  restartBtn.disabled = true;
};

leaveBtn.onclick = () => {
  ws.send(JSON.stringify({ type: 'leaveRoom', room: myRoom }));
  leaveBtn.disabled = true;
};

createBtn.onclick = () => {
  myName = nameInput.value.trim();
  if (myName.length < 2) {
    errorDiv.textContent = 'Nome muito curto!';
    return;
  }
  ws.send(JSON.stringify({ type: 'create', name: myName }));
};

joinBtn.onclick = () => {
  myName = nameInput.value.trim();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (myName.length < 2) {
    errorDiv.textContent = 'Nome muito curto!';
    return;
  }
  if (!/^[A-Z0-9]{5}$/.test(code)) {
    errorDiv.textContent = 'Código inválido!';
    return;
  }
  ws.send(JSON.stringify({ type: 'joinRoom', name: myName, room: code }));
};

startBtn.onclick = () => {
  ws.send(JSON.stringify({ type: 'startGame', room: myRoom }));
  startBtn.disabled = true;
  lobbyStatus.textContent = 'Iniciando partida...';
};

ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === 'error') {
    errorDiv.textContent = data.message;
    return;
  }
  if (data.type === 'roomCreated') {
    myRoom = data.room;
    isHost = data.host;
    salaPreparada();
    return;
  }
  if (data.type === 'joinedRoom') {
    myRoom = data.room;
    salaPreparada();
    return;
  }
  if (data.type === 'roomUpdate') {
    renderizarLobby(data.players, data.host);
    return;
  }
  if (data.type === 'gameStarted') {
    lobbyDiv.style.display = 'none';
    entrarNoJogo();
    return;
  }

  if (data.type === 'newRound') {
    messageBox.classList.remove('visible');
    messageBox.classList.add('hidden');
    postGameActions.classList.add('hidden');

    isDrawer = (data.drawer === myName);
    canDraw = isDrawer;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isDrawer) {
      wordHintDiv.innerHTML = `<b>Você é o desenhista!</b>`;
      statusDiv.textContent = 'Desenhe a palavra!';
    } else {
      wordHintDiv.innerHTML = `<b>Desenhista: ${data.drawer}</b>`;
      statusDiv.textContent = `Aguardando desenho de ${data.drawer}...`;
    }

    roundInfoDiv.textContent = `Rodada ${data.round}`;
    attemptsDiv.innerHTML = '';
    guessInput.disabled = isDrawer;
    guessBtn.disabled = isDrawer;
    gameDiv.style.display = '';

    leaderboardDiv.innerHTML = '<h3>Leaderboard</h3>' +
      Object.entries(data.leaderboard).map(([name, pts]) =>
        `<div>${name}: ${pts} pts</div>`
      ).join('');
    return;
  }

  if (data.type === 'yourTurn') {
    wordHintDiv.innerHTML = `<b >Sua palavra: ${data.word}</b>`;
    return;
  }

  if (data.type === 'correct') {
    guessInput.disabled = true;
    guessBtn.disabled = true;

    leaderboardDiv.innerHTML = '<h3>Leaderboard</h3>' +
      Object.entries(data.leaderboard).map(([name, pts]) =>
        `<div>${name}: ${pts} pts</div>`
      ).join('');

    messageBox.textContent = `${data.name} acertou a palavra! Palavra: ${data.word}`;
    messageBox.classList.remove('hidden');
    messageBox.classList.add('visible');

    statusDiv.textContent = `${data.name} acertou!`;
    return;
  }

  if (data.type === 'gameOver') {
    statusDiv.textContent = `Fim de jogo! Vencedor: ${data.winner}`;
    guessInput.disabled = true;
    guessBtn.disabled = true;

    leaderboardDiv.innerHTML = '<h3>Leaderboard</h3>' +
      Object.entries(data.leaderboard).map(([name, pts]) =>
        `<div>${name}: ${pts} pts</div>`
      ).join('');

    messageBox.textContent = `Fim de jogo! Vencedor: ${data.winner}`;
    messageBox.classList.remove('hidden');
    messageBox.classList.add('visible');

    postGameActions.classList.remove('hidden');

    if (isHost) {
      restartBtn.style.display = '';
      restartBtn.disabled = false;
      leaveBtn.style.display = 'none';
    } else {
      leaveBtn.style.display = '';
      leaveBtn.disabled = false;
      restartBtn.style.display = 'none';
    }
    return;
  }

  if (data.type === 'leftRoom') {
    gameDiv.style.display = 'none';
    loginDiv.style.display = '';
    nameInput.value = '';
    roomCodeInput.value = '';
    errorDiv.textContent = '';
    leaderboardDiv.innerHTML = '';
    attemptsDiv.innerHTML = '';
    wordHintDiv.innerHTML = '';
    roundInfoDiv.textContent = '';
    statusDiv.textContent = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    messageBox.classList.remove('visible');
    messageBox.classList.add('hidden');
    postGameActions.classList.add('hidden');
    return;
  }

  if (data.type === 'draw' && !isDrawer) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = data.drawing;
    return;
  }

  if (data.type === 'attempts') {
    attemptsDiv.innerHTML = '<h4>Tentativas:</h4>' +
      data.attempts.map(a => `<div>${a.name}: ${a.guess}</div>`).join('');
    attemptsDiv.scrollTop = attemptsDiv.scrollHeight;
    return;
  }

};


function salaPreparada() {
  errorDiv.textContent = '';
  loginDiv.style.display = 'none';
  lobbyDiv.style.display = '';
  roomCodeDisplay.textContent = myRoom;

  if (isHost) {
    startBtn.style.display = '';
    startBtn.disabled = false;
    lobbyStatus.textContent = 'Você é o host. Quando quiser, inicie a partida.';
  } else {
    startBtn.style.display = 'none';
    lobbyStatus.textContent = 'Aguardando o host iniciar a partida...';
  }
  playersList.innerHTML = '';
}

function renderizarLobby(players, hostName) {
  playersList.innerHTML = '';
  players.forEach(name => {
    const div = document.createElement('div');
    div.textContent = (name === hostName) ? `${name} (host)` : name;
    playersList.appendChild(div);
  });

  if (players.length > 0 && hostName === myName) {
    isHost = true;
    startBtn.style.display = '';
    lobbyStatus.textContent = 'Você é o host. Quando quiser, inicie a partida.';
  } else {
    isHost = false;
    startBtn.style.display = 'none';
  }
}

function entrarNoJogo() {
  lobbyDiv.style.display = 'none';
  gameDiv.style.display = '';
}


canvas.onmousedown = e => {
  if (!canDraw) return;
  drawing = true;
  last = [e.offsetX, e.offsetY];
};
canvas.onmouseup = () => drawing = false;
canvas.onmouseleave = () => drawing = false;
canvas.onmousemove = e => {
  if (!drawing || !canDraw) return;
  ctx.beginPath();
  ctx.moveTo(last[0], last[1]);
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
  last = [e.offsetX, e.offsetY];
  ws.send(JSON.stringify({ type: 'draw', room: myRoom, drawing: canvas.toDataURL() }));
};

guessBtn.onclick = () => {
  const guess = guessInput.value.trim();
  if (guess.length === 0) return;
  ws.send(JSON.stringify({ type: 'guess', room: myRoom, name: myName, guess }));
  guessInput.value = '';
};

guessInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !guessBtn.disabled && !guessInput.disabled) {
    guessBtn.click();
  }
});
