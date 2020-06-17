const CONST = require('../helper/const');
const UTIL = require('../helper/util');

const express = require('express');
const router = express.Router();
var ChessMatch = require('./game');


module.exports = function(admin, db, io, validate_session, field) {

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
		let { uid } = req.session;

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
	router.get('/get_user', field('id'), async (req, res) => {
		let id = req.field.id;

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
		return res.json(matches_cache);
	});

	// Test match
	router.get('/print_board', field('match_id'), load_match_cache(), async (req, res) => {
		let match_id = req.field.match_id;
		let chess_match = new ChessMatch();
		chess_match.update(req.match);

		res.send(chess_match.toHTML());
	});


	// =========================================================================================
	// ================================== MATCH OPERATIONS =====================================
	// =========================================================================================


	// Get match
	router.get('/get_match', field('id'), async (req, res) => {
		let id = req.field.id;

		// Query database
		let data = await db.collection(CONST.DB.MATCHES).doc(id).get();
		data = data.data();

		// Respond to client
		res.send({
			id: id,
			data: data
		});
	});

	// Get matches
	router.get('/get_matches', field('ids', 'user'), async (req, res) => {
		let ids = JSON.parse(req.field.ids);
		let user_id = req.field.user;

		// Query database
		let total = Math.ceil(ids.length / 10.0);
		let sent = 0;
		let result = [];
		let self = this;
		let enemy_data = {};

		if (user_id != 'none') {
			let snap = await db.collection(CONST.DB.USERS)
							   .where(admin.firestore.FieldPath.documentId(), '==', user_id)
							   .select('name', 'photo')
							   .get();
			enemy_data = snap.docs[0].data();
		}

		for (let i = 0; i < total; i++) {
			let ids_i = ids.slice(i * 10, i * 10 + 10);

			db.collection(CONST.DB.MATCHES)
				.where(admin.firestore.FieldPath.documentId(), "in", ids_i)
				.select('black', 'white', 'moves', 'updated')
				.get()
				.then(async snapshot => {
					await snapshot.forEach(async doc => {
						let data = doc.data();
						sent ++;
						result.push([doc.id, data]);

						if (sent == ids.length) {
							res.send({
								enemy: enemy_data,
								matches: result
							});
						}
					});
				});
		}
	});

	// Create new match
	router.post('/create_match', field('theme', 'time'), async (req, res) => {
		let theme = req.field.theme;
		let time = req.field.time;

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
	router.post('/match/update_chessboard',
		field(
			'match_id',
			'move',
			'black_timer',
			'white_timer'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, move, black_timer, white_timer } = req.field;

			// Update database
			let changes = {
				moves: req.match.moves.concat(move),
				updated: new Date().getTime(),
				black_timer: black_timer,
				white_timer: white_timer,
			};

			if (!update_match_cache(match_id, changes, req.session.uid)) {
				return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
			}
			await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });

			res.json('success');
	});

	// Update timer
	router.post('/match/update_timer',
		field(
			'match_id',
			'black_timer',
			'white_timer',
			'message'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, black_timer, white_timer, message } = req.field;

			let match = req.match;
			match.chat.push(message);

			// Update database
			let changes = {
				black_timer: black_timer,
				white_timer: white_timer,
				chat: match.chat
			};

			if (!update_match_cache(match_id, changes, req.session.uid)) {
				return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
			}
			await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });

			res.json('success');
	});

	// Checkmate
	router.post('/match/checkmate',
		field(
			'match_id',
			'winner'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, winner } = req.field;

			let match = req.match;
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
	router.post('/match/stalemate', field('match_id'), load_match_cache(), async (req, res) => {
			let { match_id } = req.field;

			let match = req.match;
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
	router.post('/match/draw', field('match_id', 'message'), load_match_cache(), async (req, res) => {
			let { match_id, message } = req.field;

			let match = req.match;
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
	router.post('/match/timesup',
		field(
			'match_id',
			'winner',
			'message'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, winner, message } = req.field;

			let match = req.match;
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
	router.post('/match/resign',
		field(
			'match_id',
			'winner',
			'message'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, winner, message } = req.field;

			let match = req.match;
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
	router.post('/match/undo',
		field(
			'match_id',
			'undo_team',
			'message'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, undo_team, message } = req.field;

			// Pop latest move
			let match = req.match;
			match.moves.pop();

			// Update database
			let changes;
			if (undo_team == CONST.TEAM.W) {
				changes = {
					moves: match.moves,
					white_undo: CONST.REQUEST.DONE
				};

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}
			else {
				changes = {
					moves: match.moves,
					black_undo: CONST.REQUEST.DONE
				};

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}

			res.json('success');
	});

	// Cancel undo
	router.post('/match/cancel_undo',
		field(
			'match_id',
			'undo_team'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, undo_team } = req.field;

			// Update database
			let changes;
			if (undo_team == CONST.TEAM.W) {
				changes = { white_undo: CONST.REQUEST.NONE };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}
			else {
				changes = { black_undo: CONST.REQUEST.NONE };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}

			res.json('success');
	});

	// Cancel draw
	router.post('/match/cancel_draw',
		field(
			'match_id',
			'draw_team'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, draw_team } = req.field;

			// Update database
			let changes;
			if (draw_team == CONST.TEAM.W) {
				changes = { white_draw: CONST.REQUEST.NONE };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}
			else {
				changes = { black_draw: CONST.REQUEST.NONE };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}

			res.json('success');
	});

	// Register opponent
	router.post('/match/register_opponent',
		field(
			'match_id',
			'white'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, white } = req.field;

			// Update database
			let changes = {
				white: white,
				updated: new Date().getTime(),
			};

			if (!update_match_cache(match_id, changes, req.session.uid)) {
				return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
			}
			await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });

			db.collection(CONST.DB.USERS).doc(white).set({
				matches: admin.firestore.FieldValue.arrayUnion(match_id + '-' + req.match.black),
			}, { merge: true });

			db.collection(CONST.DB.USERS).doc(req.match.black).set({
				matches: admin.firestore.FieldValue.arrayRemove(match_id),
			}, { merge: true });

			db.collection(CONST.DB.USERS).doc(req.match.black).set({
				matches: admin.firestore.FieldValue.arrayUnion(match_id + '-' + white),
			}, { merge: true });

			res.json('success');
	});

	// Message
	router.post('/match/message',
		field(
			'match_id',
			'message'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, message } = req.field;

			let match = req.match;
			match.chat.push(message);

			// Update database
			let changes = {
				chat: match.chat,
			};

			if (!update_match_cache(match_id, changes, req.session.uid)) {
				return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
			}
			await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });

			res.json('success');
	});

	// Change theme
	router.post('/match/change_theme',
		field(
			'match_id',
			'theme'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, theme } = req.field;

			// Update database
			let changes = {
				theme: theme
			};

			if (!update_match_cache(match_id, changes, req.session.uid)) {
				return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
			}
			await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });

			res.json('success');
	});

	// Ask undo
	router.post('/match/ask_undo',
		field(
			'match_id',
			'undo_team'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, undo_team } = req.field;

			// Update database
			let changes;
			if (undo_team == CONST.TEAM.W) {
				changes = { white_undo: CONST.REQUEST.ASK };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}
			else {
				changes = { black_undo: CONST.REQUEST.ASK };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}

			res.json('success');
	});

	// Ask draw
	router.post('/match/ask_draw',
		field(
			'match_id',
			'draw_team'
		),
		load_match_cache(), async (req, res) => {
			let { match_id, draw_team } = req.field;

			// Update database
			let changes;
			if (draw_team == CONST.TEAM.W) {
				changes = { white_draw: CONST.REQUEST.ASK };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}
			else {
				changes = { black_draw: CONST.REQUEST.ASK };

				if (!update_match_cache(match_id, changes, req.session.uid)) {
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN);
				}
				await db.collection(CONST.DB.MATCHES).doc(match_id).set(changes, { merge: true });
			}

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


	function load_match_cache() {
		return async function (req, res, next) {
			let session = req.session;
			let match_id = req.field.match_id;

			// Add cache if it's empty
			if (matches_cache[match_id] == undefined) {
				if (!await init_match_cache(match_id, req.session.uid))
					return UTIL.error(req, res, 'invalid move', CONST.HTTP.FORBIDDEN)
			}
			// Error if match ended
			else if (matches_cache[match_id] == 'ended') {
				return UTIL.error(req, res, 'match ended');
			}

			let match = matches_cache[match_id].match;

			// Error if user is not one of the players
			if (match.black != session.uid && match.white != session.uid && match.white != null) {
				return UTIL.error(req, res, 'only players can update the match.');
			}

			// Error if match ended
			if (match.moves.length != 0 && Math.floor(match.moves[match.moves.length - 1] / 10) == 0) {
				matches_cache[match_id] = 'ended';
				return UTIL.error(req, res, 'match ended.');
			}

			req.match = match;
			next();
		}
	}

	async function init_match_cache(match_id, player) {
		let match = await db.collection(CONST.DB.MATCHES).doc(match_id).get();
		match = match.data();

		let simulation = new ChessMatch();
		let succeed = simulation.update(match);

		if (succeed)
			matches_cache[match_id] = {
				match: match,
				simulation: simulation
			};

		return succeed;
	}

	function update_match_cache(match_id, changes, player) {
		let copy = {};
		Object.assign(copy, matches_cache[match_id].match);
		Object.assign(matches_cache[match_id].match, changes);

		let succeed = matches_cache[match_id].simulation.update(matches_cache[match_id].match, player);
		if (!succeed) {
			matches_cache[match_id].match = copy;
		}
		return succeed;
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
