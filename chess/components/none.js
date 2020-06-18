var Const = require('../helper/const');
var Util  = require('../helper/util');
var Piece = require('./piece');


module.exports = class None extends Piece {

	constructor(team, image) {
		super(team, Const.CHESS.None, Const.VALUE.None, image);
	}

	getPossibleMoves(game, chessboard, grid) {
		return [];
	}
}
