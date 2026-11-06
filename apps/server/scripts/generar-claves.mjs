// Genera el par de claves Ed25519 para firmar licencias.
// La privada va en el servidor (variable LICENSE_PRIVATE_KEY); la pública, en la aplicación de escritorio.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
console.log('# Copia esta línea en el .env del servidor (no la compartas):');
console.log(`LICENSE_PRIVATE_KEY="${priv.trim().replace(/\n/g, '\\n')}"`);
console.log('\n# Clave pública para la aplicación de escritorio:');
console.log(pub);
