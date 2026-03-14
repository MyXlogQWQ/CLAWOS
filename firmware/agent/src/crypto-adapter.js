const crypto = require('crypto');

function createCryptoAdapter(mode, keyB64) {
  if (mode === 'aes-gcm') {
    if (!keyB64) throw new Error('crypto mode aes-gcm requires cryptoKeyB64');
    const key = Buffer.from(keyB64, 'base64');
    if (key.length !== 32) throw new Error('cryptoKeyB64 must decode to 32-byte key for aes-256-gcm');

    return {
      encrypt(plaintext) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        const payload = Buffer.concat([iv, tag, ciphertext]);
        return payload.toString('base64');
      },
      decrypt(encoded) {
        const payload = Buffer.from(String(encoded || ''), 'base64');
        if (payload.length < 28) throw new Error('invalid encrypted payload');
        const iv = payload.subarray(0, 12);
        const tag = payload.subarray(12, 28);
        const ciphertext = payload.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString('utf8');
      },
    };
  }

  return {
    encrypt(plaintext) {
      return Buffer.from(String(plaintext), 'utf8').toString('base64');
    },
    decrypt(encoded) {
      return Buffer.from(String(encoded || ''), 'base64').toString('utf8');
    },
  };
}

module.exports = {
  createCryptoAdapter,
};
