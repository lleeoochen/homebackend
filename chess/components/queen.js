var Const = require('../helper/const');
var Util  = require('../helper/util');
var Piece = require('./piece');


module.exports = class Queen extends Piece {

	constructor(team, image) {
		super(team, Const.CHESS.Queen, Const.VALUE.Queen, image);
	}

	getPossibleMoves(game, chessboard, grid) {
		let moves = [];
		let possibleWays = [];

		if (game.get_piece(grid) == null)
			return moves;

		possibleWays.push({x:grid.x, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y});
		possibleWays.push({x:grid.x, y:grid.y});

		for (let i = 1; i < Const.BOARD_SIZE; i++) {

			for (let j = 0; j < possibleWays.length; j++) {

				if (possibleWays[j] != null) {
					switch(j) {
						case 0:
							possibleWays[j].x++;
							possibleWays[j].y++;
							break;
						case 1:
							possibleWays[j].x++;
							possibleWays[j].y--;
							break;
						case 2:
							possibleWays[j].x--;
							possibleWays[j].y++;
							break;
						case 3:
							possibleWays[j].x--;
							possibleWays[j].y--;
							break;
						case 4:
							possibleWays[j].x++;
							possibleWays[j].y;
							break;
						case 5:
							possibleWays[j].x--;
							possibleWays[j].y;
							break;
						case 6:
							possibleWays[j].x;
							possibleWays[j].y++;
							break;
						case 7:
							possibleWays[j].x;
							possibleWays[j].y--;
							break;
					}
				}

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
		}

		return moves;
	}
}
