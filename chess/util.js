const CONST      = require('./const');

module.exports = class Util {
	static checkPosition(pos) {
		if (pos != null && this.inBound(pos.x) && this.inBound(pos.y))
			return pos;
		else
			return null;
	}

	static inBound(i) {
		return i >= 0 && i < CONST.BOARD_SIZE;
	}

	static pack(oldGrid, newGrid, turn) {
		return oldGrid.x * 10000 + oldGrid.y * 1000 + newGrid.x * 100 + newGrid.y * 10 + (turn == CONST.TEAM.W ? 1 : 0);
	}

	static unpack(data, flipped) {
		let move = {
			old_x: Math.floor(data / 10000),
			old_y: Math.floor((data % 10000) / 1000),
			new_x: Math.floor((data % 1000) / 100),
			new_y: Math.floor((data % 100) / 10),
			turn: (Math.floor((data % 10) / 1) == 1) ? CONST.TEAM.W : CONST.TEAM.B
		};

		if (move.turn == CONST.TEAM.B) {
			move.old_x = CONST.BOARD_SIZE - move.old_x - 1;
			move.new_x = CONST.BOARD_SIZE - move.new_x - 1;
			move.old_y = CONST.BOARD_SIZE - move.old_y - 1;
			move.new_y = CONST.BOARD_SIZE - move.new_y - 1;
		}

		return move;
	}

	static gameFinished(match) {
		return Math.floor(match.moves[match.moves.length - 1] / 10) == 0;
	}
}