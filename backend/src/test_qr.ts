import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';

console.log("Iniciando test...");
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'gestioncredifacil-session'
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined
    }
});

client.on('qr', async (qr: string) => {
    console.log('QR RECIBIDO!');
    const url = await qrcode.toDataURL(qr);
    console.log(url.substring(0, 50));
    process.exit(0);
});

client.on('ready', () => {
    console.log('READY');
    process.exit(0);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', (msg: any) => {
    console.error('AUTH_FAILURE', msg);
    process.exit(1);
});

client.initialize()
    .then(() => console.log('initialize() resolvio'))
    .catch((err: any) => {
        console.error('Error initialize:', err);
        process.exit(1);
    });

setTimeout(() => {
    console.log("Timeout de 20s superado");
    process.exit(1);
}, 20000);
