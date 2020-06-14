const CONST = require('../const');
var Piece = require('./piece');


module.exports = class Pawn extends Piece {

	constructor(team, image) {
		super(team, CONST.CHESS.Pawn, CONST.VALUE.Pawn, image);
	}

	getPossibleMoves(chessboard, grid, downward) {
		let moves = [];
		let possibleWays = [];

		if (grid.get_piece() == null)
			return moves;

		let dir = downward ? 1 : -1;

		if ((grid.y == 1 && dir == 1 || grid.y == 6 && dir == -1)
			&& chessboard[grid.x][grid.y + dir].get_piece() == null
			&& chessboard[grid.x][grid.y + dir * 2].get_piece() == null)
			possibleWays.push({x:grid.x, y:grid.y + dir * 2});

		if (Util.inBound(grid.y + dir) && Util.inBound(grid.x + 1) && chessboard[grid.x + 1][grid.y + dir].get_piece() != null)
			possibleWays.push({x:grid.x + 1, y:grid.y + dir});

		if (Util.inBound(grid.y + dir) && Util.inBound(grid.x - 1) && chessboard[grid.x - 1][grid.y + dir].get_piece() != null)
			possibleWays.push({x:grid.x - 1, y:grid.y + dir});

		if (Util.inBound(grid.y + dir) && Util.inBound(grid.x) && chessboard[grid.x][grid.y + dir].get_piece() == null)
			possibleWays.push({x:grid.x, y:grid.y + dir});

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
