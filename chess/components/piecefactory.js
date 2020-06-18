var Const  = require('../helper/const');
var Grid   = require('./grid');
var Bishop = require('./bishop');
var King   = require('./king');
var Knight = require('./knight');
var None   = require('./none');
var Pawn   = require('./pawn');
var Queen  = require('./queen');
var Rook   = require('./rook');

module.exports = class PieceFactory {
	static createPiece(team, type, image) {
		switch (type) {
			case Const.CHESS.King:
				return new King(team, image);
			case Const.CHESS.Queen:
				return new Queen(team, image);
			case Const.CHESS.Rook:
				return new Rook(team, image);
			case Const.CHESS.Bishop:
				return new Bishop(team, image);
			case Const.CHESS.Knight:
				return new Knight(team, image);
			case Const.CHESS.Pawn:
				return new Pawn(team, image);
			default:
				return new None(team, image);
		}
	}
}
