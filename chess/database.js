var Const = require('./helper/const');


module.exports = class Database {

	constructor(admin, db) {
		this.db = db;
		this.admin = admin;
	}



	async get_profile(id) {
		let data = await this.db.collection(Const.DB.USERS).doc(id).get();
		return data.data();
	}

	async get_user(user_id) {
		let snap = await this.db.collection(Const.DB.USERS)
						   .where(this.admin.firestore.FieldPath.documentId(), '==', user_id)
						   .select('name', 'photo')
						   .get();
		return snap.docs[0].data();
	}

	listen_profile(id, callback) {
		let doc = this.db.collection(Const.DB.USERS).doc(id);
		doc.onSnapshot(snapshot => {
			callback(snapshot.data());
		});
	}

	listen_user(id, callback) {
		let doc = this.db.collection(Const.DB.USERS).doc(id);
		doc.onSnapshot(snapshot => {
			callback({
				name: snapshot.data().name,
				photo: snapshot.data().photo
			});
		});
	}

	async update_user(user_id, changes) {
		await this.db.collection(Const.DB.USERS).doc(user_id).set(changes, { merge: true });
	}




	create_match(uid, theme, time) {
		return this.db.collection(Const.DB.MATCHES).add({
			black: uid,
			white: null,
			moves: [],
			chat: [],
			theme: theme,
			updated: new Date().getTime(),
			black_timer: time || Const.MAX_TIME,
			white_timer: time || Const.MAX_TIME,
			black_undo: Const.REQUEST.NONE,
			white_undo: Const.REQUEST.NONE,
			black_draw: Const.REQUEST.NONE,
			white_draw: Const.REQUEST.NONE,
		});
	}

	async get_match(id) {
		let data = await this.db.collection(Const.DB.MATCHES).doc(id).get();
		return data.data();
	}

	get_matches(ids) {
		return this.db.collection(Const.DB.MATCHES)
			.where(this.admin.firestore.FieldPath.documentId(), "in", ids)
			.select('black', 'white', 'moves', 'theme', 'updated')
			.get();
	}

	listen_match(id, callback) {
		let doc = this.db.collection(Const.DB.MATCHES).doc(id);
		doc.onSnapshot(snapshot => {
			callback(snapshot.data());
		});
	}

	async update_match(match_id, changes) {
		await this.db.collection(Const.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}

	async finish_match(match_id, match, move, message) {
		if (message) match.chat.push(message);
		if (move) match.moves.push(move);

		// Update database
		let changes = {
			moves: match.moves,
			chat: match.chat,
			updated: new Date().getTime()
		};
		await this.db.collection(Const.DB.MATCHES).doc(match_id).set(changes, { merge: true });
	}
}
