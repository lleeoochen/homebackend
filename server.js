const SERVICEACCOUNT = require('./firebase-key.json');
const PORT = 8000;

// NodeJS modules
require('dotenv').config();
const CONST = require('./const');
const express = require('express');
const app = express();
const router = express.Router();
const body_parser = require('body-parser')
const server = require('http').Server(app);
const io = require('socket.io')(server);
const util = require('./util');
const cors = require('cors');


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


const cors_option = {
	origin: process.env.ALLOWED_ORIGIN || "https://weitungchen.com",
	methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
	preflightContinue: false,
	optionsSuccessStatus: 204,
	credentials: true,
	allowedHeaders: 'Content-Type'
};

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
const chess_routes = require('./routes/chess')(admin, db, io);
app.use('/chess', chess_routes);


// =========================================================================================
// ================================== BASIC OPERATIONS =====================================
// =========================================================================================


// Create client session
app.post('/login', util.fields('auth_token'), async (req, res) => {
	let auth_token = req.fields.auth_token;

	admin.auth().verifyIdToken(auth_token).then(async function(auth_user) {
		// Get session id
		let session_id = util.encrypt(req.connection.remoteAddress, auth_user.uid);

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
	let routes = [];

	app._router.stack.forEach(item => {
		if (item.route)
			routes.push({
				path: item.route.path,
				methods: item.route.methods
			});
	});

	chess_routes.stack.forEach(item => {
		if (item.route)
			routes.push({
				path: '/chess' + item.route.path,
				methods: item.route.methods
			});
	});

	res.json(routes);
});


// =========================================================================================
// ================================== HELPER FUNCTIONS =====================================
// =========================================================================================


// Start server
server.listen(PORT, function() {
	console.log('Server listening on port 8000.');
});
