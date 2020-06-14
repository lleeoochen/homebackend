const CONST      = require('./const');
// var Piece        = require('./components/piece');
var PieceFactory = require('./components/piecefactory');
var Grid   = require('./components/grid');


class ChessMatch {

	constructor(match) {
		// White's side of chessboard
		this.chessboard = [[],[],[],[],[],[],[],[]];
		this.moves = [];
		this.moves_applied = 0;

		this.my_team = CONST.TEAM.W;
		this.enemy_team = CONST.TEAM.B;

		this.king_grid = null;
		this.king_moved = false;
		this.other_king_moved = false;

		this.passant_pawn = null;
		this.moves_stack = [];
		this.passant_stack = [];
		this.id = 0;

		this.initBoard();
		this.initPieces();

		console.log(match);
		console.log(this.chessboard);
		console.log(Grid.pieces);

		// Apply existing moves
		while (this.moves_applied < match.moves.length) {
			let move = Util.unpack(match.moves[this.moves_applied]);

			console.log(move);
			this.moveChess(this.chessboard[move.old_x][move.old_y], this.chessboard[move.new_x][move.new_y]);

			// Update move counter and switch turn
			this.moves_applied += 1;
			console.log("hi");
		}
		console.log(this.chessboard);
	}

	//Intialize chessboard background
	initBoard(){
		for (var x = 0; x < CONST.BOARD_SIZE; x++) {
			for (var y = 0; y < CONST.BOARD_SIZE; y++) {
				//Grid instance
				this.chessboard[x][y] = new Grid(x, y, -1, null);
			}
		}
	}

	//Intialize all chess pieces
	initPieces() {
		let black_pos = 0;
		let black_pawn_pos = 1;
		let white_pos = 7;
		let white_pawn_pos = 6;

		let king_x = 4;
		let queen_x = 3;

		this.initEachPiece(this.id++, 0, black_pos, CONST.TEAM.B, CONST.CHESS.Rook);
		this.initEachPiece(this.id++, 7, black_pos, CONST.TEAM.B, CONST.CHESS.Rook);
		this.initEachPiece(this.id++, 1, black_pos, CONST.TEAM.B, CONST.CHESS.Knight);
		this.initEachPiece(this.id++, 6, black_pos, CONST.TEAM.B, CONST.CHESS.Knight);
		this.initEachPiece(this.id++, 2, black_pos, CONST.TEAM.B, CONST.CHESS.Bishop);
		this.initEachPiece(this.id++, 5, black_pos, CONST.TEAM.B, CONST.CHESS.Bishop);

		this.initEachPiece(this.id++, queen_x, black_pos, CONST.TEAM.B, CONST.CHESS.Queen);
		this.initEachPiece(this.id++, king_x, black_pos, CONST.TEAM.B, CONST.CHESS.King);

		this.initEachPiece(this.id++, 0, white_pos, CONST.TEAM.W, CONST.CHESS.Rook);
		this.initEachPiece(this.id++, 7, white_pos, CONST.TEAM.W, CONST.CHESS.Rook);
		this.initEachPiece(this.id++, 1, white_pos, CONST.TEAM.W, CONST.CHESS.Knight);
		this.initEachPiece(this.id++, 6, white_pos, CONST.TEAM.W, CONST.CHESS.Knight);
		this.initEachPiece(this.id++, 2, white_pos, CONST.TEAM.W, CONST.CHESS.Bishop);
		this.initEachPiece(this.id++, 5, white_pos, CONST.TEAM.W, CONST.CHESS.Bishop);

		this.initEachPiece(this.id++, queen_x, white_pos, CONST.TEAM.W, CONST.CHESS.Queen);
		this.initEachPiece(this.id++, king_x, white_pos, CONST.TEAM.W, CONST.CHESS.King);

		for (var x = 0; x < CONST.BOARD_SIZE; x++) {
			this.initEachPiece(this.id++, x, black_pawn_pos, CONST.TEAM.B, CONST.CHESS.Pawn);
			this.initEachPiece(this.id++, x, white_pawn_pos, CONST.TEAM.W, CONST.CHESS.Pawn);
		}
	}


	//Intialize each chess piece
	initEachPiece(id, x, y, team, type) {
		this.chessboard[x][y].piece = id;
		Grid.pieces[id] = PieceFactory.createPiece(team, type);

		if (this.my_team == team && type == CONST.CHESS.King)
			this.king_grid = this.chessboard[x][y];
	}

	isValidMove(oldGrid, newGrid) {
		let isLegal = this.isLegalMove(newGrid);
		isLegal = isLegal && this.isKingSafe(oldGrid, newGrid);

		if (this.canCastle(oldGrid, newGrid))
			return true;

		if (isLegal)
			return true;

		return false;
	}

	//Get all valid friends and enemies that can eat keyGrid
	getReachablePieces(board, keyGrid, team) {
		let friends = [];
		let enemies = [];

		let keyPiece = keyGrid.piece;
		keyGrid.piece = 100;
		pieces[100] = PieceFactory.createPiece(team, CONST.CHESS.None, null);

		for (let i = 0; i < board.length; i++) {
			for (let j = 0; j < board.length; j++) {
				let grid = board[i][j];
				if (grid.get_piece() != null) {
					let downward = grid.get_piece().team != this.my_team;
					let validMoves = grid.get_piece().getPossibleMoves(board, grid, downward);
					let found = false;

					for (let k = 0; k < validMoves.length && !found; k++)
						if (validMoves[k].x == keyGrid.x && validMoves[k].y == keyGrid.y)
							found = true;

					if (found) {
						if (grid.get_piece().team == team)
							friends.push(grid);
						else
							enemies.push(grid);
					}

				}
			}
		}

		keyGrid.piece = keyPiece;
		return {friends: friends, enemies: enemies};
	}

	isCheckmate() {
		for (let i = 0; i < this.chessboard.length; i++) {
			for (let j = 0; j < this.chessboard.length; j++) {
				let grid = this.chessboard[i][j];
				if (grid.get_piece() != null && grid.get_piece().team == this.my_team) {
					let validMoves = grid.get_piece().getPossibleMoves(this.chessboard, grid);

					for (let k = 0; k < validMoves.length; k++) {
						if (this.isKingSafe(grid, this.chessboard[validMoves[k].x][validMoves[k].y])) {
							return STATUS_NONE;
						}
					}
				}
			}
		}

		if (this.isKingSafe()) {
			return STATUS_STALEMATE;
		}
		return STATUS_CHECKMATE;
	}

	//Update and show all possible moves based on a specific grid
	updateMoves(grid) {
		this.moves = grid.get_piece().getPossibleMoves(this.chessboard, grid);

		//Show left castle move for king
		if (!this.king_moved && grid == this.king_grid && this.canCastle(grid, this.chessboard[grid.x - 2][grid.y]))
			this.moves.push(this.chessboard[grid.x - 2][grid.y]);

		//Show right castle move for king
		if (!this.king_moved && grid == this.king_grid && this.canCastle(grid, this.chessboard[grid.x + 2][grid.y]))
			this.moves.push(this.chessboard[grid.x + 2][grid.y]);

		//Show en passant move for pawn
		if (this.passant_pawn) {
			if (grid.get_piece().team != this.passant_pawn.get_piece().team) {
				if (Math.abs(grid.x - this.passant_pawn.x) == 1 && grid.y == this.passant_pawn.y) {
					if (grid.get_piece().team == this.my_team)
						this.moves.push(this.chessboard[this.passant_pawn.x][this.passant_pawn.y - 1]);
					else
						this.moves.push(this.chessboard[this.passant_pawn.x][this.passant_pawn.y + 1]);
				}
			}
		}
	}

	//Get numbering from grid
	getNumbering(x, y) {
		return {
			x: (this.my_team == CONST.TEAM.B) ? y + 1 : CONST.BOARD_SIZE - y,
			y: (this.my_team == CONST.TEAM.B) ? String.fromCharCode(97 + 7 - x) : String.fromCharCode(x + 97)
		}
	}


	//Check legal move of chess piece
	isLegalMove(grid) {
		let legalMove = false;
		for (let i = 0; i < this.moves.length && !legalMove; i++)
			if (grid.x == this.moves[i].x && grid.y == this.moves[i].y)
				legalMove = true;
		return legalMove;
	}

	//Check legal move of chess piece
	isKingSafe(oldGrid, newGrid) {
		let board = this.copyBoard(this.chessboard);

		let isKingSafe = true;
		let target_grid = this.king_grid;

		if (oldGrid && newGrid) {
			board[newGrid.x][newGrid.y].piece = board[oldGrid.x][oldGrid.y].piece;
			board[oldGrid.x][oldGrid.y].piece = -1;

			if (oldGrid == this.king_grid)
				target_grid = newGrid;
		}

		let validPieces = this.getReachablePieces(board, target_grid, this.my_team)
		let enemies = validPieces.enemies;
		let friends = validPieces.friends;

		return enemies.length == 0;
	}

	canCastle(oldGrid, newGrid) {
		if (oldGrid != this.king_grid) return false;
		if (newGrid.y != CONST.BOARD_SIZE - 1) return false;
		if (Math.abs(newGrid.x - oldGrid.x) != 2) return false;
		if (this.king_moved) return false;
		if (!this.isKingSafe()) return false;

		let leftSide = newGrid.x - oldGrid.x < 0;
		if (leftSide) {
			for (let x = 1; x < oldGrid.x; x++)
				if (this.chessboard[x][CONST.BOARD_SIZE - 1].get_piece())
					return false;
			return this.isKingSafe(this.king_grid, this.chessboard[this.king_grid.x - 1][this.king_grid.y])
				&& this.isKingSafe(this.king_grid, this.chessboard[this.king_grid.x - 2][this.king_grid.y]);
		}
		else {
			for (let x = oldGrid.x + 1; x < CONST.BOARD_SIZE - 1; x++)
				if (this.chessboard[x][CONST.BOARD_SIZE - 1].get_piece())
					return false;
			return this.isKingSafe(this.king_grid, this.chessboard[this.king_grid.x + 1][this.king_grid.y])
				&& this.isKingSafe(this.king_grid, this.chessboard[this.king_grid.x + 2][this.king_grid.y]);
		}
	}

	//Switch active team turn
	// switchTurn() {
	// 	if (this.turn == CONST.TEAM.B) {
	// 		this.turn = CONST.TEAM.W;
	// 	}
	// 	else {
	// 		this.turn = CONST.TEAM.B;
	// 	}
	// }

	copyBoard(board) {
		let newBoard = [[],[],[],[],[],[],[],[]];
		for (let i = 0; i < board.length; i++) {
			for (let j = 0; j < board.length; j++) {
				newBoard[i][j] = new Grid(i, j, board[i][j].piece, board[i][j].color);
			}
		}
		return newBoard;
	}


	//======================================================================== 
	//============================= Move Chess =============================== 
	//======================================================================== 


	//Move chess from oldGrid to newGrid
	moveChess(oldGrid, newGrid) {

		//===================== Special Moves ========================

		// Passant Move
		// this.movePassantPawn(oldGrid, newGrid);

		// Castle Move
		// this.moveCastleKing(oldGrid, newGrid);

		// Remove newGrid piece if being eaten
		// this.moveEatPiece(oldGrid, newGrid);
		newGrid.piece = oldGrid.piece;

		//====================== Update Miscs =======================

		// Pawn to Queen Move
		// this.movePawnToQueen(oldGrid, newGrid);

		// Update king position
		this.king_grid = oldGrid == this.king_grid ? newGrid : this.king_grid;

		// Clear old grid piece
		oldGrid.piece = -1;

		// Switch turn
		// switchTurn();
	}

	movePassantPawn(oldGrid, newGrid) {
		let kill_passant_pawn = false;

		// Check passant pawn can be killed
		if (this.passant_pawn) {
			if (oldGrid.get_piece().team == this.my_team && this.passant_pawn.get_piece().team != this.my_team) {
				if (newGrid.x == this.passant_pawn.x && newGrid.y == this.passant_pawn.y - 1) {
					kill_passant_pawn = true;
				}
			}
			else if (oldGrid.get_piece().team != this.my_team && this.passant_pawn.get_piece().team == this.my_team) {
				if (newGrid.x == this.passant_pawn.x && newGrid.y == this.passant_pawn.y + 1) {
					kill_passant_pawn = true;
				}
			}
		}

		// Kill passant pawn
		if (kill_passant_pawn && this.passant_pawn) {
			this.stackEatenPiece(oldGrid, newGrid, this.passant_pawn, this.passant_pawn.piece, true, CONST.FLAG_PASSANT_PAWN);
			this.passant_pawn.piece = -1;
		}

		// Update passant pawns on 2 moves
		this.passant_pawn = undefined;
		if (oldGrid.get_piece().type == CONST.CHESS.Pawn) {
			if (oldGrid.get_piece().team == this.my_team) {
				if (oldGrid.y - newGrid.y == 2) {
					this.passant_pawn = newGrid;
				}
			}
			else {
				if (newGrid.y - oldGrid.y == 2) {
					this.passant_pawn = newGrid;
				}
			}
		}
		passant_stack.push(this.passant_pawn);
	}

	moveCastleKing(oldGrid, newGrid) {
		// If oldGrid is king
		if (oldGrid.get_piece().type == CONST.CHESS.King) {

			// If either king hasn't move
			if (this.my_team == oldGrid.get_piece().team && !this.king_moved || this.my_team != oldGrid.get_piece().team && !this.other_king_moved) {

				// Perform right castle
				if (newGrid.x - oldGrid.x == 2) {
					this.chessboard[oldGrid.x + 1][oldGrid.y].piece = this.chessboard[CONST.BOARD_SIZE - 1][oldGrid.y].piece;
					this.chessboard[CONST.BOARD_SIZE - 1][oldGrid.y].piece = -1;
					this.stackEatenPiece(oldGrid, newGrid, newGrid, newGrid.piece, true, CONST.FLAG_KING_CASTLE);
				}

				// Perform left castle
				if (newGrid.x - oldGrid.x == -2) {
					this.chessboard[oldGrid.x - 1][oldGrid.y].piece = this.chessboard[0][oldGrid.y].piece;
					this.chessboard[0][oldGrid.y].piece = -1;
					this.stackEatenPiece(oldGrid, newGrid, newGrid, newGrid.piece, true, CONST.FLAG_KING_CASTLE);
				}

			}
		}

		//King has moved, cannot castle anymore
		if (oldGrid == king_grid) {
			this.king_moved = true;
		}

		//Other King has moved, cannot castle anymore
		if (this.my_team != oldGrid.get_piece().team && oldGrid.get_piece().type == CONST.CHESS.King) {
			this.other_king_moved = true;
		}
	}

	movePawnToQueen(oldGrid, newGrid) {
		if (newGrid.get_piece().type == CONST.CHESS.Pawn) {
			let myPawnArrived = newGrid.get_piece().team == this.my_team && newGrid.y == 0;
			let enemyPawnArrived = newGrid.get_piece().team != this.my_team && newGrid.y == CONST.BOARD_SIZE - 1;

			if (myPawnArrived || enemyPawnArrived) {
				let eatenPiece = moves_stack.pop().eaten_piece;
				this.stackEatenPiece(oldGrid, newGrid, newGrid, eatenPiece, false, CONST.FLAG_PAWN_TO_QUEEN);

				initEachPiece(id++, newGrid.x, newGrid.y, newGrid.get_piece().team, CONST.CHESS.Queen);
			}
		}
	}

	stackEatenPiece(oldGrid, newGrid, eatenGrid, eatenPiece, toPopOne, flag) {
		if (toPopOne) moves_stack.pop();
		moves_stack.push({
			old_x: oldGrid.x,
			old_y: oldGrid.y,
			new_x: newGrid.x,
			new_y: newGrid.y,
			eaten_x: eatenGrid.x,
			eaten_y: eatenGrid.y,
			eaten_piece: eatenPiece,
			flag: flag
		});
	}

}



class Util {
	static checkPosition(pos) {
		if (pos != null && this.inBound(pos.x) && this.inBound(pos.y))
			return pos;
		else
			return null;
	}

	static inBound(i) {
		return i >= 0 && i < CONST.BOARD_SIZE;
	}

	static pack(oldGrid, newGrid, turn) {
		return oldGrid.x * 10000 + oldGrid.y * 1000 + newGrid.x * 100 + newGrid.y * 10 + (turn == CONST.TEAM.W ? 1 : 0);
	}

	static unpack(data, flipped) {
		let move = {
			old_x: Math.floor(data / 10000),
			old_y: Math.floor((data % 10000) / 1000),
			new_x: Math.floor((data % 1000) / 100),
			new_y: Math.floor((data % 100) / 10),
			turn: (Math.floor((data % 10) / 1) == 1) ? CONST.TEAM.W : CONST.TEAM.B
		};

		if (move.turn == CONST.TEAM.B) {
			move.old_x = CONST.BOARD_SIZE - move.old_x - 1;
			move.new_x = CONST.BOARD_SIZE - move.new_x - 1;
			move.old_y = CONST.BOARD_SIZE - move.old_y - 1;
			move.new_y = CONST.BOARD_SIZE - move.new_y - 1;
		}

		return move;
	}

	static gameFinished(match) {
		return Math.floor(match.moves[match.moves.length - 1] / 10) == 0;
	}
}

module.exports = ChessMatch;