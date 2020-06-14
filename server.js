const SERVICEACCOUNT = require('./firebase-key.json');
const PORT = 8000;

// NodeJS modules
require('dotenv').config();
const CONST = require('./helper/const');
const UTIL = require('./helper/util');

const express = require('express');
const app = express();
const router = express.Router();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const body_parser = require('body-parser')
const cors = require('cors');

var origins = ["https://weitungchen.com"];
if (process.env.ALLOWED_ORIGINS)
	origins = origins.concat(process.env.ALLOWED_ORIGINS.split(','));

const cors_option = {
	origin: origins,
	methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
	preflightContinue: false,
	optionsSuccessStatus: 204,
	credentials: true,
	allowedHeaders: 'Content-Type'
};

// =========================================================================================
// =============================== FIREBASE INITIALIZATION =================================
// =========================================================================================


// Firebase modules
const admin = require('firebase-admin');
admin.initializeApp({
	credential: admin.credential.cert(SERVICEACCOUNT)
});
const db = admin.firestore();


// =========================================================================================
// ==================================== MIDDLEWARES ========================================
// =========================================================================================


// Middlewares
app.use(body_parser.urlencoded({ extended: false }));
app.use(body_parser.json());
app.use(cors(cors_option));

// Enable cookie
app.use((req, res, next) => {
	res.header("Set-Cookie", "HttpOnly;Secure;SameSite=Strict");
	next();
});

// Add /chess routes
const chess_router = require('./chess/router')(admin, db, io, validate_session, field);
app.use('/chess', chess_router);


// =========================================================================================
// ================================== BASIC OPERATIONS =====================================
// =========================================================================================


// Create client session
app.post('/login', field('auth_token'), async (req, res) => {
	let auth_token = req.field.auth_token;

	admin.auth().verifyIdToken(auth_token).then(async function(auth_user) {
		// Get session id
		let session_id = UTIL.encrypt(req.connection.remoteAddress, auth_user.uid);

		// Update database
		let changes = {
			email: auth_user.email,
			photo: auth_user.picture,
			name: auth_user.name
		};
		await db.collection(CONST.DB.USERS).doc(auth_user.uid).set(changes, { merge: true });

		// Send session_id to client
		res.cookie('session_id', session_id, { maxAge: 2592000000, httpOnly: true });
		res.json('success');
	});
});


// Delete client session
app.post('/logout', (req, res) => {
	res.clearCookie('session_id').json('success');
});


// Get all routes
app.get('/routes', (req, res) => {
	let routes = '<table>';

	app._router.stack.forEach(item => {
		if (item.route)
			routes += `
				<tr>
					<td>${ Array.from(Object.keys(item.route.methods)).join(' ').toUpperCase() }</td>
					<td>${ item.route.path }</td>
				<tr>
			`;
	});

	chess_router.stack.forEach(item => {
		if (item.route)
			routes += `
				<tr>
					<td>${ Array.from(Object.keys(item.route.methods)).join(' ').toUpperCase() }</td>
					<td>/chess${ item.route.path }</td>
				<tr>
			`;
	});

	routes += '</table>';

	res.send(routes);
});


// Start server
server.listen(PORT, function() {
	console.log(`Server listening on port ${ PORT }.`);
});

// =========================================================================================
// ================================== HELPER FUNCTIONS =====================================
// =========================================================================================


function validate_session(req, res, next) {
	req.session = UTIL.get_session(req);
	if (req.session == undefined)
		return UTIL.session_error(req, res);
	next();
}

function field(...keys) {
	return function (req, res, next) {
		req.field = {};

		for (let i in keys) {
			let key = keys[i];
			let val = req.query[key] || req.body[key];

			if (val == undefined)
				return UTIL.field_error(req, res, key);

			req.field[key] = val;
		}
		next();
	}
}
