const CONST = require('../const');
var Piece = require('./piece');


module.exports = class King extends Piece {

	constructor(team, image) {
		super(team, CONST.CHESS.King, CONST.VALUE.King, image);
	}

	getPossibleMoves(chessboard, grid) {
		let moves = [];
		let possibleWays = [];

		if (grid.get_piece() == null)
			return moves;

		possibleWays.push({x:grid.x + 1, y:grid.y});
		possibleWays.push({x:grid.x - 1, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y + 1});
		possibleWays.push({x:grid.x, y:grid.y - 1});
		possibleWays.push({x:grid.x + 1, y:grid.y + 1});
		possibleWays.push({x:grid.x + 1, y:grid.y - 1});
		possibleWays.push({x:grid.x - 1, y:grid.y + 1});
		possibleWays.push({x:grid.x - 1, y:grid.y - 1});

		for (let j = 0; j < possibleWays.length; j++) {

			let move = Util.checkPosition(possibleWays[j]);
			if (move != null) {

				let target = chessboard[move.x][move.y];
				if (target.get_piece() == null)
					moves.push(Object.assign({}, move));

				else {
					if (target.get_piece().team != grid.get_piece().team)
						moves.push(Object.assign({}, move));
					possibleWays[j] = null;
				}
			}
		}

		return moves;
	}
}
