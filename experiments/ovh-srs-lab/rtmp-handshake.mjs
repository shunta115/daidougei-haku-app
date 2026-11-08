// Local-only RTMP handshake probe. It never sends credentials or stream names.
import net from 'node:net';

const socket = net.connect({ host: '127.0.0.1', port: 1935 });
const timer = setTimeout(() => socket.destroy(new Error('RTMP handshake response timeout')), 4000);
let received = 0;
socket.once('connect', () => {
  const c0c1 = Buffer.alloc(1537);
  c0c1[0] = 3;
  socket.write(c0c1);
});
socket.on('data', chunk => {
  received += chunk.length;
  if (received >= 1537) {
    clearTimeout(timer);
    console.log(JSON.stringify({ rtmpHandshakeResponseBytes: received }));
    socket.destroy();
  }
});
socket.on('error', () => {
  clearTimeout(timer);
  console.error('RTMP handshake failed');
  process.exitCode = 1;
});
socket.on('close', () => {
  clearTimeout(timer);
  if (received < 1537) {
    console.error('RTMP handshake closed before S0/S1');
    process.exitCode = 1;
  }
});
