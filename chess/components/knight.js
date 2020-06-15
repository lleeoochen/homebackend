const CONST = require('../const');
var Piece = require('./piece');
var Util   = require('../util');


module.exports = class Knight extends Piece {

	constructor(team, image) {
		super(team, CONST.CHESS.Knight, CONST.VALUE.Knight, image);
	}

	getPossibleMoves(game, chessboard, grid) {
		let moves = [];
		let possibleWays = [];

		if (game.get_piece(grid) == null)
			return moves;

		possibleWays.push({x:grid.x + 2, y:grid.y + 1});
		possibleWays.push({x:grid.x + 2, y:grid.y - 1});
		possibleWays.push({x:grid.x - 2, y:grid.y + 1});
		possibleWays.push({x:grid.x - 2, y:grid.y - 1});
		possibleWays.push({x:grid.x + 1, y:grid.y + 2});
		possibleWays.push({x:grid.x + 1, y:grid.y - 2});
		possibleWays.push({x:grid.x - 1, y:grid.y + 2});
		possibleWays.push({x:grid.x - 1, y:grid.y - 2});

		for (let j = 0; j < possibleWays.length; j++) {

			let move = Util.checkPosition(possibleWays[j]);
			if (move != null) {

				let target = chessboard[move.x][move.y];
				if (game.get_piece(target) == null)
					moves.push(Object.assign({}, move));

				else {
					if (game.get_piece(target).team != game.get_piece(grid).team)
						moves.push(Object.assign({}, move));
					possibleWays[j] = null;
				}
			}
		}

		return moves;
	}
}
