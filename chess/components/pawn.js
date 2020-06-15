const CONST = require('../const');
var Piece = require('./piece');


module.exports = class Pawn extends Piece {

	constructor(team, image) {
		super(team, CONST.CHESS.Pawn, CONST.VALUE.Pawn, image);
	}

	getPossibleMoves(game, chessboard, grid, downward) {
		let moves = [];
		let possibleWays = [];

		if (game.get_piece(grid) == null)
			return moves;

		let dir = downward ? 1 : -1;

		if ((grid.y == 1 && dir == 1 || grid.y == 6 && dir == -1)
			&& game.get_piece(chessboard[grid.x][grid.y + dir]) == null
			&& game.get_piece(chessboard[grid.x][grid.y + dir * 2]) == null)
			possibleWays.push({x:grid.x, y:grid.y + dir * 2});

		if (Util.inBound(grid.y + dir) && Util.inBound(grid.x + 1) && game.get_piece(chessboard[grid.x + 1][grid.y + dir]) != null)
			possibleWays.push({x:grid.x + 1, y:grid.y + dir});

		if (Util.inBound(grid.y + dir) && Util.inBound(grid.x - 1) && game.get_piece(chessboard[grid.x - 1][grid.y + dir]) != null)
			possibleWays.push({x:grid.x - 1, y:grid.y + dir});

		if (Util.inBound(grid.y + dir) && Util.inBound(grid.x) && game.get_piece(chessboard[grid.x][grid.y + dir]) == null)
			possibleWays.push({x:grid.x, y:grid.y + dir});

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
