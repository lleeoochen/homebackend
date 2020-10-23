const fs = require('fs');
const secretKeyFile = 'secret/key';
const secretIvFile = 'secret/iv';

// Credit: https://codeforgeek.com/encrypt-and-decrypt-data-in-node-js/
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
var key = crypto.randomBytes(32);
var iv = crypto.randomBytes(16);

fs.readFile(secretKeyFile, (err, data) => {
	if (data) key = data;
});

fs.readFile(secretIvFile, (err, data) => {
	if (data) iv = data;
});

fs.writeFile(secretKeyFile, key, () => {});
fs.writeFile(secretIvFile, iv, () => {});


// Encrypt a text
module.exports.encrypt = function(text) {
	text = JSON.stringify(text);

	let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);

	return JSON.stringify({ iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') });
}

// Decrypt a text
module.exports.decrypt = function(text) {
	try {
		text = JSON.parse(text);

		let iv = Buffer.from(text.iv, 'hex');
		let encryptedText = Buffer.from(text.encryptedData, 'hex');
		let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
		let decrypted = decipher.update(encryptedText);
		decrypted = Buffer.concat([decrypted, decipher.final()]);

		return JSON.parse(decrypted.toString());
	}
	catch (err) {
		return undefined;
	}
}
