var Const = require('../helper/const');
var Util  = require('../helper/util');
var Piece = require('./piece');


module.exports = class King extends Piece {

	constructor(team, image) {
		super(team, Const.CHESS.King, Const.VALUE.King, image);
	}

	getPossibleMoves(game, chessboard, grid) {
		let moves = [];
		let possibleWays = [];

		if (game.get_piece(grid) == null)
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
