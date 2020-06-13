const CONST = require('../helper/const');
const UTIL = require('../helper/util');
const express = require('express');
const router = express.Router();

module.exports = function(admin, db, io, validate_session) {

	// Validate session
	router.use(validate_session);

	// Matches cache
	var matches_cache = {};

	// Periodically clean cache
	setInterval(function() {
		cleanCache();
	},
	CONST.CACHE_EXPIRE_TIME);


	// =========================================================================================
	// ================================ GENERAL OPERATIONS =====================================
	// =========================================================================================


	// Get profile
	router.get('/get_profile', async (req, res) => {
		let uid = req.session.uid;

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
	router.get('/get_user', UTIL.fields('id'), async (req, res) => {
		let id = req.fields.id;

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

	// Get cache
	router.get('/get_cache', async (req, res) => {
		console.log(matches_cache);
		return res.json('success');
	});


	// =========================================================================================
	// ================================== MATCH OPERATIONS =====================================
	// =========================================================================================



	// Get match
	router.get('/get_match', UTIL.fields('id'), async (req, res) => {
		let id = req.fields.id;

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
	router.get('/get_matches', UTIL.fields('ids'), async (req, res) => {
		let ids = JSON.parse(req.fields.ids);

		// Query database
		let uid = req.session.uid;
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
	router.post('/create_match', UTIL.fields('theme', 'time'), async (req, res) => {
		let theme = req.fields.theme;
		let time = req.fields.time;

		// Query database
		db.collection(CONST.DB.MATCHES).add({
			black: req.session.uid,
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
			await db.collection(CONST.DB.USERS).doc(req.session.uid).set({
				matches: admin.firestore.FieldValue.arrayUnion(ref.id)
			}, { merge: true });

			// Respond to client
			res.json(ref.id);
		});
	});


	// =========================================================================================
	// ============================== MATCH UPDATE OPERATIONS ==================================
	// =========================================================================================


	// Update chessboard
	router.post('/match/update_chessboard', UTIL.fields('match_id', 'move', 'black_timer', 'white_timer'), async (req, res) => {
		let match_id = req.fields.match_id;
		let move = req.fields.move;
		let black_timer = req.fields.black_timer;
		let white_timer = req.fields.white_timer;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/update_timer', UTIL.fields('match_id', 'black_timer', 'white_timer', 'message'), async (req, res) => {
		let match_id = req.fields.match_id;
		let black_timer = req.fields.black_timer;
		let white_timer = req.fields.white_timer;
		let message = req.fields.message;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/checkmate', UTIL.fields('match_id', 'winner'), async (req, res) => {
		let match_id = req.fields.match_id;
		let winner = req.fields.winner;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/stalemate', UTIL.fields('match_id'), async (req, res) => {
		let match_id = req.fields.match_id;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/draw', UTIL.fields('match_id', 'message'), async (req, res) => {
		let match_id = req.fields.match_id;
		let message = req.fields.message;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/timesup', UTIL.fields('match_id', 'winner', 'message'), async (req, res) => {
		let match_id = req.fields.match_id;
		let winner = req.fields.winner;
		let message = req.fields.message;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/resign', UTIL.fields('match_id', 'winner', 'message'), async (req, res) => {
		let match_id = req.fields.match_id;
		let winner = req.fields.winner;
		let message = req.fields.message;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/undo', UTIL.fields('match_id', 'undo_team', 'message'), async (req, res) => {
		let match_id = req.fields.match_id;
		let undo_team = req.fields.undo_team;
		let message = req.fields.message;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/cancel_undo', UTIL.fields('match_id', 'undo_team'), async (req, res) => {
		let match_id = req.fields.match_id;
		let undo_team = req.fields.undo_team;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/cancel_draw', UTIL.fields('match_id', 'draw_team'), async (req, res) => {
		let match_id = req.fields.match_id;
		let draw_team = req.fields.draw_team;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/register_opponent', UTIL.fields('match_id', 'white'), async (req, res) => {
		let match_id = req.fields.match_id;
		let white = req.fields.white;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/message', UTIL.fields('match_id', 'message'), async (req, res) => {
		let match_id = req.fields.match_id;
		let message = req.fields.message;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/change_theme', UTIL.fields('match_id', 'theme'), async (req, res) => {
		let match_id = req.fields.match_id;
		let theme = req.fields.theme;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

		// Update database
		let changes = {
			theme: theme
		};
		await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
		Object.assign(matches_cache[match_id], changes);

		res.json('success');
	});

	// Ask undo
	router.post('/match/ask_undo', UTIL.fields('match_id', 'undo_team'), async (req, res) => {
		let match_id = req.fields.match_id;
		let undo_team = req.fields.undo_team;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	router.post('/match/ask_draw', UTIL.fields('match_id', 'draw_team'), async (req, res) => {
		let match_id = req.fields.match_id;
		let draw_team = req.fields.draw_team;

		// Check update privilege
		let validation = await validate_match(req.session, match_id);
		if (!validation.success) return UTIL.error(req, res, validation.data);

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
	// ================================ SOCKET OPERATIONS ======================================
	// =========================================================================================


	// Socket connection
	io.use(function(socket, next) {
		// Check session
		let session = UTIL.get_session(socket.handshake);
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


	// =========================================================================================
	// ================================== HELPER FUNCTIONS =====================================
	// =========================================================================================


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

		if (match.moves.length != 0 && Math.floor(match.moves[match.moves.length - 1] / 10) == 0) {
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


	return router;
}
