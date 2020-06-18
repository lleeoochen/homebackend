var Const = require('./helper/const');
var Util = require('./helper/util');

var Simulation = require('./simulation');


module.exports = class MatchesCache {

	constructor(database) {
		this.cache = {};
		this.database = database;

		// Periodically clean cache
		setInterval(() => {
			this.clean_cache();
		},
		Const.CACHE_EXPIRE_TIME);
	}

	load_match() {
		return async (req, res, next) => {
			let session = req.session;
			let match_id = req.field.match_id;

			// Add cache if it's empty
			if (this.cache[match_id] == undefined) {
				if (!await this.init_match(match_id, req.session.uid))
					return Util.error(req, res, 'invalid move', Const.HTTP.FORBIDDEN)
			}
			// Error if match ended
			else if (this.cache[match_id] == 'ended') {
				return Util.error(req, res, 'match ended');
			}

			let match = this.cache[match_id].match;

			// Error if user is not one of the players
			if (match.black != session.uid && match.white != session.uid && match.white != null) {
				return Util.error(req, res, 'only players can update the match.');
			}

			// Error if match ended
			if (match.moves.length != 0 && Math.floor(match.moves[match.moves.length - 1] / 10) == 0) {
				this.cache[match_id] = 'ended';
				return Util.error(req, res, 'match ended.');
			}

			req.match = match;
			next();
		}
	}

	async init_match(match_id, player) {
		let match = await this.database.get_match(match_id);

		let simulation = new Simulation();
		let succeed = simulation.update(match);

		if (succeed)
			this.cache[match_id] = {
				match: match,
				simulation: simulation
			};

		return succeed;
	}

	verify_match(match_id, changes, player) {
		let original = {};
		Object.assign(original, this.cache[match_id].match);
		Object.assign(this.cache[match_id].match, changes);

		let succeed = this.cache[match_id].simulation.update(this.cache[match_id].match, player);
		if (!succeed) {
			this.cache[match_id].match = original;
		}
		return succeed;
	}

	clean_cache() {
		for (let id in this.cache) {
			let match = this.cache[id];

			if (typeof match == 'object') {
				if (match.updated && new Date().getTime() - match.updated > Const.CACHE_EXPIRE_TIME) {
					delete this.cache[id];
				}
			}
			else {
				delete this.cache[id];
			}
		}
	}
}
