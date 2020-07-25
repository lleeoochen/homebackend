var express = require('express');
var router = express.Router();

var Const = require('./helper/const');
var Util = require('./helper/util');

var Simulation = require('./simulation');
var Database = require('./database');
var MatchesCache = require('./cache');

module.exports = function(admin, db, io, validate_session, field) {

	// Validate session
	router.use(validate_session);

	// Initialize database
	var database = new Database(admin, db);

	// Initialize matches cache
	var matches_cache = new MatchesCache(database);

	// =========================================================================================
	// ================================ GENERAL OPERATIONS =====================================
	// =========================================================================================


	// Get profile
	router.get('/get_profile', async (req, res) => {
		let { uid } = req.session;

		res.send({
			id: uid,
			data: await database.get_profile(uid)
		});
	});

	// Get user
	router.get('/get_user', field('id'), async (req, res) => {
		let { id } = req.field;

		res.send({
			id: id,
			data: await database.get_user(id)
		});
	});

	// Update user
	router.post('/update_user', field('changes'), async (req, res) => {
		let { uid } = req.session;
		let { changes } = req.field;

		await database.update_user(uid, changes);
		res.json('success');
	});

    // Request friend
    router.post('/request_friend', field('user_id'), async (req, res) => {
        let { uid } = req.session;
        let { user_id } = req.field;

        await database.request_friend(uid, user_id);
        res.json('success');
    });

    // Accept friend request
    router.post('/accept_friend', field('user_id'), async (req, res) => {
        let { uid } = req.session;
        let { user_id } = req.field;

        await database.accept_friend(uid, user_id);
        res.json('success');
    });

	// Get cache
	router.get('/get_cache', async (req, res) => {
		return res.json(matches_cache);
	});

	// Test match
	router.get('/print_board', field('match_id'), matches_cache.load_match(), async (req, res) => {
		let match_id = req.field.match_id;

		let chess_match = new Simulation();
		chess_match.update(req.match);

		res.send(chess_match.toHTML());
	});


	// =========================================================================================
	// ================================== MATCH OPERATIONS =====================================
	// =========================================================================================


	// Get match
	router.get('/get_match', field('id'), async (req, res) => {
		let id = req.field.id;

		res.send({
			id: id,
			data: await database.get_match(id)
		});
	});

	// Get matches
	router.get('/get_matches', field('ids', 'user'), async (req, res) => {
		let ids = JSON.parse(req.field.ids);
		let user_id = req.field.user;

		let total = Math.ceil(ids.length / 10.0);
		let result = [];
		let promises = [];

		// Query database
		for (let i = 0; i < total; i++) {
			let ids_i = ids.slice(i * 10, i * 10 + 10);
			promises.push(database.get_matches(ids_i));
		}

		// Return matches
		Promise.all(promises).then(async snapshots => {
			for (let i in snapshots) {
				snapshots[i].forEach(doc => {
					let data = doc.data();
					result.push([doc.id, data]);
				});
			}

			let enemy = {};
			if (user_id != 'none') {
				enemy = {
					...await database.get_user(user_id),
					user_id,
				}
			}

			res.send({
				enemy: enemy,
				matches: result
			});
		});
	});

	// Create new match
	router.post('/create_match', field('theme', 'time', 'AI'), async (req, res) => {
		let { theme, time, AI } = req.field;

		// Create match
		let ref = await database.create_match(req.session.uid, theme, time, AI);

		// Update user's matches
		await database.update_user(req.session.uid, {
			matches: admin.firestore.FieldValue.arrayUnion(ref.id + (AI ? '-AI' : ''))
		});

		// Respond to client
		res.json(ref.id);
	});

	// Delete match
	router.post('/delete_match', field('match_id'), async (req, res) => {
		let { match_id } = req.field;
		let match = await database.get_match(match_id);

		if (req.session.uid != match.black && req.session.uid != match.white) {
			return res.json('User not permitted.');
		}


		let enemy = req.session.uid == match.black ? match.white : match.black;

		// Create match
		await database.delete_match(match_id);

		// Update user's matches
		await database.update_user(req.session.uid, {
			matches: admin.firestore.FieldValue.arrayRemove(enemy + '-' + match_id)
		});
		await database.update_user(enemy, {
			matches: admin.firestore.FieldValue.arrayRemove(req.session.uid + '-' + match_id)
		});

		// Respond to client
		res.json('success');
	});


	// =========================================================================================
	// ============================== MATCH UPDATE OPERATIONS ==================================
	// =========================================================================================


	// Register opponent
	router.post('/match/register_opponent',
		field(
			'match_id',
			'white'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, white } = req.field;

			// DB changes
			let changes = {
				white: white,
				updated: new Date().getTime(),
			};

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			// Update white player's matches
			database.update_user(white, {
				matches: admin.firestore.FieldValue.arrayUnion(match_id + '-' + req.match.black)
			});

			// Update black player's matches
			database.update_user(req.match.black, {
				matches: admin.firestore.FieldValue.arrayRemove(match_id)
			});

			database.update_user(req.match.black, {
				matches: admin.firestore.FieldValue.arrayUnion(match_id + '-' + white)
			});

			res.json('success');
		});

	// Update chessboard
	router.post('/match/update_chessboard',
		field(
			'match_id',
			'move',
			'black_timer',
			'white_timer'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, move, black_timer, white_timer } = req.field;

			// DB changes
			let changes = {
				moves: req.match.moves.concat(move),
				updated: new Date().getTime(),
				black_timer: black_timer,
				white_timer: white_timer,
			};

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});

	// Undo move
	router.post('/match/undo',
		field(
			'match_id',
			'undo_team',
			'message'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, undo_team, message } = req.field;

			// Pop latest move
			let match = req.match;
			match.moves.pop();

			// DB changes
			let key = (undo_team == Const.TEAM.W) ? 'white_undo' : 'black_undo';
			let changes = {
				moves: match.moves
			};
			changes[key] = Const.REQUEST.DONE;

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

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
		matches_cache.load_match(), async (req, res) => {
			let { match_id, black_timer, white_timer, message } = req.field;

			let match = req.match;
			match.chat.push(message);

			// DB changes
			let changes = {
				black_timer: black_timer,
				white_timer: white_timer,
				chat: match.chat
			};

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});

	// Message
	router.post('/match/message',
		field(
			'match_id',
			'message'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, message } = req.field;

			let match = req.match;
			match.chat.push(message);

			// DB changes
			let changes = { chat: match.chat };

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});

	// Change theme
	router.post('/match/change_theme',
		field(
			'match_id',
			'theme'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, theme } = req.field;

			// DB changes
			let changes = { theme: theme };

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});


	// =========================================================================================
	// ==================================== MATCH ENDINGS ======================================
	// =========================================================================================


	// Checkmate
	router.post('/match/checkmate',
		field(
			'match_id',
			'winner'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, winner } = req.field;

			let match = req.match;
			let move = winner == Const.TEAM.W ? Const.ENDING.CHECKMATE_WHITE : Const.ENDING.CHECKMATE_BLACK;
			database.finish_match(match_id, match, move);

			res.json('success');
		});

	// Stalemate
	router.post('/match/stalemate',
		field(
			'match_id'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id } = req.field;

			let match = req.match;
			database.finish_match(match_id, match, Const.ENDING.STALEMATE);

			res.json('success');
		});

	// Draw
	router.post('/match/draw',
		field(
			'match_id',
			'message'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, message } = req.field;

			let match = req.match;
			database.finish_match(match_id, match, Const.ENDING.DRAW, message);

			res.json('success');
		});

	// Timesup
	router.post('/match/timesup',
		field(
			'match_id',
			'winner',
			'message'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, winner, message } = req.field;

			let match = req.match;
			let move = winner == Const.TEAM.W ? Const.ENDING.TIMESUP_WHITE : Const.ENDING.TIMESUP_BLACK;
			database.finish_match(match_id, match, move, message);

			res.json('success');
		});

	// Resign
	router.post('/match/resign',
		field(
			'match_id',
			'winner',
			'message'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, winner, message } = req.field;

			let match = req.match;
			let move = winner == Const.TEAM.W ? Const.ENDING.RESIGN_WHITE : Const.ENDING.RESIGN_BLACK;
			database.finish_match(match_id, match, move, message);

			res.json('success');
		});


	// =========================================================================================
	// ======================================= MATCH UNDO ======================================
	// =========================================================================================


	// Ask undo
	router.post('/match/ask_undo',
		field(
			'match_id',
			'undo_team'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, undo_team } = req.field;

			// DB changes
			let key = (undo_team == Const.TEAM.W) ? 'white_undo' : 'black_undo';
			let changes = {};
			changes[key] = Const.REQUEST.ASK;

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});

	// Cancel undo
	router.post('/match/cancel_undo',
		field(
			'match_id',
			'undo_team'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, undo_team } = req.field;

			// DB changes
			let key = (undo_team == Const.TEAM.W) ? 'white_undo' : 'black_undo';
			let changes = {};
			changes[key] = Const.REQUEST.NONE;

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});


	// =========================================================================================
	// ======================================= MATCH DRAW ======================================
	// =========================================================================================


	// Ask draw
	router.post('/match/ask_draw',
		field(
			'match_id',
			'draw_team'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, draw_team } = req.field;

			// DB changes
			let key = (draw_team == Const.TEAM.W) ? 'white_draw' : 'black_draw';
			let changes = {};
			changes[key] = Const.REQUEST.ASK;

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});

	// Cancel draw
	router.post('/match/cancel_draw',
		field(
			'match_id',
			'draw_team'
		),
		matches_cache.load_match(), async (req, res) => {
			let { match_id, draw_team } = req.field;

			// DB changes
			let key = (draw_team == Const.TEAM.W) ? 'white_draw' : 'black_draw';
			let changes = {};
			changes[key] = Const.REQUEST.NONE;

			// Update match
			let success = await update_match(match_id, changes, req.session.uid);
			if (!success) return match_error(req, res);

			res.json('success');
		});


	// =========================================================================================
	// ================================ SOCKET OPERATIONS ======================================
	// =========================================================================================


	// Socket connection
	io.use(function(socket, next) {
		let req = {
			headers: {
				authorization: socket.handshake.query.token
			}
		};

		// Check session
		let session = Util.get_session(req);
		if (session == undefined) {
			next(new Error('Authentication error'));
		}
		else {
			socket.handshake.query.session = session;
			next();
		}
	})
	.on('connection', function (socket) {
		let listeners = [];

		// Listen profile
		socket.on('listen_profile', () => {
			let id = socket.handshake.query.session.uid;
			if (id == undefined)
				return socket.emit('listen_profile', 'Error: missing field id.');

			listeners.push(database.listen_profile(id, user => {
				console.log("Profile updated: ", user.matches.length);
				socket.emit('listen_profile', {
					data: user
				});
			}));
		});

		// Listen user
		socket.on('listen_user', id => {
			if (id == undefined)
				return socket.emit('listen_user_' + id, 'Error: missing field id.');

			listeners.push(database.listen_user(id, user => {
				socket.emit('listen_user_' + id, {
					id: id,
					data: user
				});
			}));
		});

		// Listen match
		socket.on('listen_match', id => {
			if (id == undefined)
				return socket.emit('listen_match_' + id, 'Error: missing field id.');

			listeners.push(database.listen_match(id, match => {
				socket.emit('listen_match_' + id, {
					id: id,
					data: match
				})
			}));
		});

		socket.on('disconnect', () => {
			for (let listener of listeners) {
				listener(); // disconnect firebase listener
			}
		});
	});


	// =========================================================================================
	// ================================== HELPER FUNCTIONS =====================================
	// =========================================================================================

	function match_error(req, res) {
		Util.error(req, res, 'invalid move');
	}

	async function update_match(match_id, changes, uid) {
		if (!matches_cache.verify_match(match_id, changes, uid)) {
			return false;
		}
		await database.update_match(match_id, changes);
		return true;
	}

	return router;
}
