module.exports = Object.freeze({
	CHESS: {King: "King", Queen: "Queen", Rook: "Rook", Bishop: "Bishop", Knight: "Knight", Pawn: "Pawn", None: "None"},
	TEAM: {B: "B", W: "W", None:"N"},
	VALUE: {King: 200, Queen: 9, Rook: 5, Bishop: 3, Knight: 3, Pawn: 1, None: 0},

	BOARD_SIZE: 8,

	STATUS_NONE: 0,
	STATUS_CHECKMATE: 1,
	STATUS_STALEMATE: 2,

	FLAG_NONE: 0,
	FLAG_KING_CASTLE: 1,
	FLAG_PASSANT_PAWN: 2,
	FLAG_PAWN_TO_QUEEN: 3,
});
