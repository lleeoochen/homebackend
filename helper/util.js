const CONST = require('./const');
const hammer = require('./hammer');

function get_cookies(request) {
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

function get_session(req, addr) {
	let session = hammer.decrypt(get_cookies(req).session_id);

	if (session == undefined
		|| session.uid == undefined
		|| (req.connection && session.ip != req.connection.remoteAddress))
		return undefined;
	else
		return session;
}

function error(req, res, message, code=CONST.HTTP.BAD_REQUEST) {
	console.log(`Error-${code} ${ req.path }: ${message}`);
	return res.status(code).json(message);
}

function session_error(req, res) {
	return error(req, res, 'invalid session.', CONST.HTTP.UNAUTHORIZED);
}

function field_error(req, res, field) {
	return error(req, res, `missing field ${ field }.`);
}

function encrypt(ip, uid) {
	return hammer.encrypt({ ip: ip, uid: uid });
}

module.exports = {
	get_cookies,
	get_session,
	error,
	session_error,
	field_error,
	encrypt,
};
