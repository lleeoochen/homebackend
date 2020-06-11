module.exports = Object.freeze({
	DB: {
		MATCHES: "chess_matches",
		USERS:   "chess_users",
	},

	ENDING: {
		CHECKMATE_WHITE: 0,
		CHECKMATE_BLACK: 1,
		STALEMATE:       2,
		TIMESUP_WHITE:   3,
		TIMESUP_BLACK:   4,
		RESIGN_WHITE:    5,
		RESIGN_BLACK:    6,
		DRAW:            7,	
	},

	REQUEST: {
		NONE: 0,
		ASK:  1,
		DONE: 2,
	},

	THEME: {
		CLASSIC: 0,
		WINTER:  1,
		METAL:   2,
		NATURE:  3,
	},

	TEAM: {
		B: "B",
		W: "W",
		None:"N"
	},

	MAX_TIME: 60 * 60, // 1 Hour Max (Infinite time otherwise)
	MAX_STAT: 42, // treat king as 3 score

	CACHE_EXPIRE_TIME: 5 * 60 * 1000 // in milliseconds
});
