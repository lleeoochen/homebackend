const CONST = require('./const');
const Hammer = require('./hammer');

module.exports = class Util {
	static get_cookies(request) {
		let cookies = {};
		if (request.headers && request.headers.cookie) {
			decodeURIComponent(request.headers.cookie).split(';').forEach(function(cookie) {
				let parts = cookie.match(/(.*?)=(.*)$/);
				if (parts)
					cookies[ parts[1].trim() ] = (parts[2] || '').trim();
			});
		}
		return cookies;
	}

	static get_session(req, addr) {
		let session = Hammer.decrypt(req.headers['authorization']);

		if (session == undefined
			|| session.uid == undefined
			|| session.expire <= new Date().getTime()
			|| (req.connection && session.ip != req.connection.remoteAddress))
			return undefined;
		else
			return session;
	}

	static error(req, res, message, code=CONST.HTTP.BAD_REQUEST) {
		console.log(`Error-${code} ${ req.path }: ${message}`);
		return res.status(code).json(message);
	}

	static session_error(req, res) {
		return Util.error(req, res, 'invalid session.', CONST.HTTP.UNAUTHORIZED);
	}

	static field_error(req, res, field) {
		return Util.error(req, res, `missing field ${ field }.`);
	}

	static encrypt(ip, uid) {
		let expire_date = new Date();
		expire_date.setDate(expire_date.getDate() + 30);

		return Hammer.encrypt({
			ip: ip,
			uid: uid,
			expire: expire_date.getTime()
		});
	}
}
