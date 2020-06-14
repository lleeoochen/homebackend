class Grid {

	constructor(x, y, piece, color) {
		this.x = x;
		this.y = y;
		this.piece = piece;
		this.color = color;
	}
	get_piece() {
		if (this.piece == -1) return null;
		return pieces[this.piece];
	}
}

Grid.pieces = {};

module.exports = Grid;