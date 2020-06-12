const SERVICEACCOUNT = require('./firebase-key.json');
const PORT = 8000;

// NodeJS modules
const express = require('express');
const app = express();
const body_parser = require('body-parser')
const server = require('http').Server(app);
const io = require('socket.io')(server);
const hammer = require('./hammer');
const CONST = require('./const');
require('dotenv').config()

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "https://weitungchen.com");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	res.header("Access-Control-Allow-Credentials", "true");
	res.header("Set-Cookie", "HttpOnly;Secure;SameSite=Strict");
	next();
});

// Enable body parsing
app.use(body_parser.urlencoded({ extended: false }))
app.use(body_parser.json())

// Firebase modules
const admin = require('firebase-admin');
admin.initializeApp({
	credential: admin.credential.cert(SERVICEACCOUNT)
});
const db = admin.firestore();

// Matches cache
var matches_cache = {};

// Periodically clean cache
setInterval(function() {
	cleanCache();
}, CONST.CACHE_EXPIRE_TIME);

// =========================================================================================
// ================================== BASIC OPERATIONS =====================================
// =========================================================================================


// Create client session
app.post('/login', async (req, res) => {

	// Check body fields
	let auth_token = req.body.auth_token;
	if (auth_token == undefined) return field_error(req, res, "auth_token");

	admin.auth().verifyIdToken(auth_token).then(async function(auth_user) {
		// Get session id
		let session_id = hammer.encrypt({
			ip: req.connection.remoteAddress,
			uid: auth_user.uid
		});



		// Update database
		let changes = {
			email: auth_user.email,
			photo: auth_user.picture,
			name: auth_user.name
		};
		await db.collection(CONST.DB.USERS).doc(auth_user.uid).set(changes, { merge: true });

		// Send session_id to client
		res.cookie('session_id', session_id, { maxAge: 2592000000, httpOnly: true });
		res.json('success');
	});
});


// Delete client session
app.post('/logout', (req, res) => {
	res.clearCookie('session_id').json('success');
});


// Get profile
app.get('/get_profile', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	let uid = session.uid;

	// Query database
	let data = await db.collection(CONST.DB.USERS).doc(uid).get();
	data = data.data();

	// Respond to client
	res.send({
		id: uid,
		data: data
	});
});


// Get user
app.get('/get_user', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let id = req.query.id;
	if (id == undefined) return field_error(req, res, "id");

	// Query database
	let snap = await db.collection(CONST.DB.USERS)
					   .where(admin.firestore.FieldPath.documentId(), '==', id)
					   .select('name', 'photo')
					   .get();
	let data = snap.docs[0].data();

	// Respond to client
	res.send({
		id: id,
		data: data
	});
});


// Get match
app.get('/get_match', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let id = req.query.id;
	if (id == undefined) return field_error(req, res, "id");

	// Query database
	let data = await db.collection(CONST.DB.MATCHES).doc(id).get();
	data = data.data();

	// Respond to client
	res.send({
		id: id,
		data: data
	});
	matches_cache[id] = data;
});


// Get matches
app.get('/get_matches', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let ids = req.query.ids;
	if (ids == undefined) return field_error(req, res, "id");
	ids = JSON.parse(ids);

	// Query database
	let uid = session.uid;
	let total = Math.ceil(ids.length / 10.0);
	let sent = 0;
	let result = [];
	let self = this;

	for (let i = 0; i < total; i++) {
		let ids_i = ids.slice(i * 10, i * 10 + 10);

		db.collection(CONST.DB.MATCHES)
			.where(admin.firestore.FieldPath.documentId(), "in", ids_i)
			.select('black', 'white', 'moves', 'updated')
			.get()
			.then(async snapshot => {
				await snapshot.forEach(async doc => {
					let data = doc.data();
					let id = (uid == data.black) ? data.white : data.black;

					if (id) {
						let snap = await db.collection(CONST.DB.USERS)
										   .where(admin.firestore.FieldPath.documentId(), '==', id)
										   .select('name')
										   .get();
						let user_data = snap.docs[0].data();

						result.push([doc.id, data, user_data]);
						sent ++;

						if (sent == ids.length) {
							res.send({ data: result });
						}
					}
					else {
						sent ++;
						result.push([doc.id, data, null]);
						if (sent == ids.length) {
							res.send({ data: result });
						}
					}
				});
			});
	}
});


// Create new match
app.post('/create_match', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let theme = req.body.theme;
	if (theme == undefined) return field_error(req, res, "theme");

	let time = req.body.time;
	if (time == undefined) return field_error(req, res, "time");

	// Query database
	db.collection(CONST.DB.MATCHES).add({
		black: session.uid,
		white: null,
		moves: [],
		chat: [],
		theme: theme,
		updated: new Date().getTime(),
		black_timer: time || CONST.MAX_TIME,
		white_timer: time || CONST.MAX_TIME,
		black_undo: CONST.REQUEST.NONE,
		white_undo: CONST.REQUEST.NONE,
		black_draw: CONST.REQUEST.NONE,
		white_draw: CONST.REQUEST.NONE,
	})
	.then(async ref => {
		console.log(ref);
		await db.collection(CONST.DB.USERS).doc(session.uid).set({
			matches: admin.firestore.FieldValue.arrayUnion(ref.id)
		}, { merge: true });

		// Respond to client
		res.json(ref.id);
	});
});


// Get cache
app.get('/get_cache', async (req, res) => {
	console.log(matches_cache);
	return res.json('success');
});

// =========================================================================================
// ================================== MATCH OPERATIONS =====================================
// =========================================================================================


// Update chessboard
app.post('/update_chessboard', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let move = req.body.move;
	if (move == undefined) return field_error(req, res, "move");

	let black_timer = req.body.black_timer;
	if (black_timer == undefined) return field_error(req, res, "black_timer");

	let white_timer = req.body.white_timer;
	if (white_timer == undefined) return field_error(req, res, "white_timer");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	match.moves.push(move);

	// Update database
	let changes = {
		moves: match.moves,
		updated: new Date().getTime(),
		black_timer: black_timer,
		white_timer: white_timer,
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Update timer
app.post('/update_timer', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let black_timer = req.body.black_timer;
	if (black_timer == undefined) return field_error(req, res, "black_timer");

	let white_timer = req.body.white_timer;
	if (white_timer == undefined) return field_error(req, res, "white_timer");

	let message = req.body.message;
	if (message == undefined) return field_error(req, res, "message");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	match.chat.push(message);

	// Update database
	let changes = {
		black_timer: black_timer,
		white_timer: white_timer,
		chat: match.chat
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Checkmate
app.post('/checkmate', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let winner = req.body.winner;
	if (winner == undefined) return field_error(req, res, "winner");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	let move = winner == CONST.TEAM.W ? CONST.ENDING.CHECKMATE_WHITE : CONST.ENDING.CHECKMATE_BLACK;
	match.moves.push(move);

	// Update database
	let changes = {
		moves: match.moves,
		updated: new Date().getTime()
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	matches_cache[match_id] = 'ended';

	res.json('success');
});


// Stalemate
app.post('/stalemate', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	match.moves.push(CONST.ENDING.STALEMATE);

	// Update database
	let changes = {
		moves: match.moves,
		updated: new Date().getTime()
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	matches_cache[match_id] = 'ended';

	res.json('success');
});


// Draw
app.post('/draw', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let message = req.body.message;
	if (message == undefined) return field_error(req, res, "message");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	match.chat.push(message);
	match.moves.push(CONST.ENDING.DRAW);

	// Update database
	let changes = {
		moves: match.moves,
		chat: match.chat,
		updated: new Date().getTime()
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	matches_cache[match_id] = 'ended';

	res.json('success');
});


// Timesup
app.post('/timesup', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let winner = req.body.winner;
	if (winner == undefined) return field_error(req, res, "winner");

	let message = req.body.message;
	if (message == undefined) return field_error(req, res, "message");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	let move = winner == CONST.TEAM.W ? CONST.ENDING.TIMESUP_WHITE : CONST.ENDING.TIMESUP_BLACK;
	match.chat.push(message);
	match.moves.push(move);

	// Update database
	let changes = {
		moves: match.moves,
		chat: match.chat,
		updated: new Date().getTime()
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	matches_cache[match_id] = 'ended';

	res.json('success');
});


// Resign
app.post('/resign', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let winner = req.body.winner;
	if (winner == undefined) return field_error(req, res, "winner");

	let message = req.body.message;
	if (message == undefined) return field_error(req, res, "message");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	let move = winner == CONST.TEAM.W ? CONST.ENDING.RESIGN_WHITE : CONST.ENDING.RESIGN_BLACK;
	match.chat.push(message);
	match.moves.push(move);

	// Update database
	let changes = {
		moves: match.moves,
		chat: match.chat,
		updated: new Date().getTime()
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	matches_cache[match_id] = 'ended';

	res.json('success');
});


// Undo move
app.post('/undo', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let undo_team = req.body.undo_team;
	if (undo_team == undefined) return field_error(req, res, "undo_team");

	let message = req.body.message;
	if (message == undefined) return field_error(req, res, "message");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	// Pop latest move
	let match = validation.data;
	match.moves.pop();

	// Update database
	let changes;
	if (undo_team == CONST.TEAM.W) {
		changes = {
			moves: match.moves,
			white_undo: CONST.REQUEST.DONE
		};
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	else {
		changes = {
			moves: match.moves,
			black_undo: CONST.REQUEST.DONE
		};
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Cancel undo
app.post('/cancel_undo', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let undo_team = req.body.undo_team;
	if (undo_team == undefined) return field_error(req, res, "undo_team");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	// Update database
	let changes;
	if (undo_team == CONST.TEAM.W) {
		changes = { white_undo: CONST.REQUEST.NONE };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	else {
		changes = { black_undo: CONST.REQUEST.NONE };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Cancel draw
app.post('/cancel_draw', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let draw_team = req.body.draw_team;
	if (draw_team == undefined) return field_error(req, res, "draw_team");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	// Update database
	let changes;
	if (draw_team == CONST.TEAM.W) {
		changes = { white_draw: CONST.REQUEST.NONE };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	else {
		changes = { black_draw: CONST.REQUEST.NONE };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Register opponent
app.post('/register_opponent', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let white = req.body.white;
	if (white == undefined) return field_error(req, res, "white");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	// Update database
	let changes = {
		white: white,
		updated: new Date().getTime(),
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	Object.assign(matches_cache[match_id], changes);

	await db.collection(CONST.DB.USERS).doc(white).set({
		matches: admin.firestore.FieldValue.arrayUnion(match_id),
	}, { merge: true });

	res.json('success');
});


// Message
app.post('/message', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let message = req.body.message;
	if (message == undefined) return field_error(req, res, "message");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	let match = validation.data;
	match.chat.push(message);

	// Update database
	let changes = {
		chat: match.chat,
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Change theme
app.post('/change_theme', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let theme = req.body.theme;
	if (theme == undefined) return field_error(req, res, "theme");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	// Update database
	let changes = {
		theme: theme
	};
	await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Ask undo
app.post('/ask_undo', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let undo_team = req.body.undo_team;
	if (undo_team == undefined) return field_error(req, res, "undo_team");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	// Update database
	let changes;
	if (undo_team == CONST.TEAM.W) {
		changes = { white_undo: CONST.REQUEST.ASK };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	else {
		changes = { black_undo: CONST.REQUEST.ASK };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});


// Ask draw
app.post('/ask_draw', async (req, res) => {
	// Check session
	let session = get_session(req);
	if (session == undefined) return session_error(req, res);

	// Check query fields
	let match_id = req.body.match_id;
	if (match_id == undefined) return field_error(req, res, "match_id");

	let draw_team = req.body.draw_team;
	if (draw_team == undefined) return field_error(req, res, "draw_team");

	// Check update privilege
	let validation = await validate_match(session, match_id);
	if (!validation.success) return error(req, res, validation.data);

	// Update database
	let changes;
	if (draw_team == CONST.TEAM.W) {
		changes = { white_draw: CONST.REQUEST.ASK };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	else {
		changes = { black_draw: CONST.REQUEST.ASK };
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
	Object.assign(matches_cache[match_id], changes);

	res.json('success');
});



// =========================================================================================
// ================================== OTHER OPERATIONS =====================================
// =========================================================================================


// Start server
server.listen(PORT, function() {
	console.log('Server listening on port 8000.');
});


// Socket connection
io.use(function(socket, next) {
	// Check session
	let session = get_session(socket.handshake);
	if (session == undefined)
		next(new Error('Authentication error'));
	else
		next();
})
.on('connection', function (socket) {

	// Listen user
	socket.on('listen_user', id => {
		if (id == undefined) {
			res.send('Error: missing field id.');
			return;
		}

		let doc = db.collection(CONST.DB.USERS).doc(id);
		doc.onSnapshot(snapshot => {
			socket.emit('listen_user_' + id, {
				id: id,
				data: {
					name: snapshot.data().name,
					photo: snapshot.data().photo,
				}
			})
		});
	});

	// Listen match
	socket.on('listen_match', id => {
		if (id == undefined) {
			res.send('Error: missing field id.');
			return;
		}

		let doc = db.collection(CONST.DB.MATCHES).doc(id);
		doc.onSnapshot(snapshot => {
			socket.emit('listen_match_' + id, {
				id: id,
				data: snapshot.data()
			})
		});
	});

	socket.on('disconnect', () => {
	});
});


function get_cookies(request) {
	let cookies = {};
	if (request.headers && request.headers.cookie) {
		decodeURIComponent(request.headers.cookie).split(';').forEach(function(cookie) {
			let parts = cookie.match(/(.*?)=(.*)$/);
			if (parts)
				cookies[ parts[1].trim() ] = (parts[2] || '').trim();
		});
	}
	return cookies;
}

function get_session(req, addr) {
	let session = hammer.decrypt(get_cookies(req).session_id);

	if (session == undefined
		|| session.uid == undefined
		|| (req.connection && session.ip != req.connection.remoteAddress))
		return undefined;
	else
		return session;
}

function error(req, res, message, code=400) {
	console.log(`Error-${code} ${ req.route.path }: ${message}`);
	return res.status(code).json(message);
}

function session_error(req, res) {
	return error(req, res, 'invalid session.', 440);
}

function field_error(req, res, field) {
	return error(req, res, `missing field ${ field }.`);
}

async function validate_match(session, match_id) {

	// Add cache if it's empty
	if (matches_cache[match_id] == undefined) {
		await update_match_cache(match_id);
	}
	else if (matches_cache[match_id] == 'ended') {
		return {
			success: false,
			data: 'match ended.'
		};
	}

	let match = matches_cache[match_id];
	if (match.black != session.uid && match.white != session.uid && match.white != null) {
		return {
			success: false,
			data: 'only players can update the match.'
		};
	}

	if (match.moves.length != 0 && match.moves[match.moves.length - 1] / 10 == 0) {
		matches_cache[match_id] = 'ended';
		return {
			success: false,
			data: 'match ended.'
		};
	}

	return {
		success: true,
		data: match
	};
}

async function update_match_cache(match_id) {
	let match = await db.collection(CONST.DB.MATCHES).doc(match_id).get();
	match = match.data();
	matches_cache[match_id] = match;
}

function cleanCache() {
	console.log('cleaning cache!');
	for (let id in matches_cache) {
		let match = matches_cache[id];

		if (typeof match == 'object') {
			if (match.updated && new Date().getTime() - match.updated > CONST.CACHE_EXPIRE_TIME) {
				delete matches_cache[id];
			}
		}
		else {
			delete matches_cache[id];
		}
	}
}
