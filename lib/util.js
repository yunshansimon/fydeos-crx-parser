const crypto = require('crypto');

function calculateId(publicKey){
  return crypto.createHash('sha256')
    .update(new Buffer(publicKey))
    .digest("hex")
    .slice(0, 32)
    .split('')
    .map(function (c) {
        return c >= 'a' ? String.fromCharCode(c.charCodeAt() + 10) :
            String.fromCharCode('a'.charCodeAt() + c.charCodeAt() - '0'.charCodeAt());
    })
    .join('');
}

function getFileName(path){
  return path.match(/[^\/]+\.\w+$/)[0];
}

module.exports={calculateId, getFileName}