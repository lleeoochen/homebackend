const CONST = require('../const');
var Piece = require('./piece');


module.exports = class None extends Piece {

	constructor(team, image) {
		super(team, CONST.CHESS.None, CONST.VALUE.None, image);
	}

	getPossibleMoves(game, chessboard, grid) {
		return [];
	}
}
