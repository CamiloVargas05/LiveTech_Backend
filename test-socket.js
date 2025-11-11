// test-socket.js
const { io } = require('socket.io-client');
const readline = require('readline');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmOWUwNWRkNS05NDhmLTRkYjItYTM1Mi1hMTVkMDExY2JjNzYiLCJlbWFpbCI6Im1hbm9sb21hbm9saXRlQGdtYWlsLmNvbSIsInJvbGUiOiJ0ZWNuaWNvIiwiaWF0IjoxNzYyODE4MzQ4LCJleHAiOjE3NjM0MjMxNDh9.xKmDtYifEm6zZrjVImEksgv0y7Eh_TyYZy3vpFZVnts';
const MANTENIMIENTO_ID = 'c56eb98d-4b35-467b-9d1a-dc3d6e3cd2d9';

console.log('🔄 Conectando al WebSocket...\n');

const socket = io('http://localhost:3000/streaming', {
  auth: { token: TOKEN },
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ ¡CONECTADO!');
  console.log('📱 Socket ID:', socket.id);
  console.log('════════════════════════════════\n');
  mostrarMenu();
});

socket.on('stream-iniciado', (data) => {
  console.log('\n✅ EVENTO: stream-iniciado');
  console.log('📦 Datos:', JSON.stringify(data, null, 2));
  console.log('════════════════════════════════\n');
  mostrarMenu();
});

socket.on('stream-disponible', (data) => {
  console.log('\n✅ EVENTO: stream-disponible');
  console.log('📦 Datos:', JSON.stringify(data, null, 2));
  console.log('════════════════════════════════\n');
  mostrarMenu();
});

socket.on('usuario-conectado', (data) => {
  console.log('\n👤 EVENTO: usuario-conectado');
  console.log('📦 Datos:', JSON.stringify(data, null, 2));
  console.log('════════════════════════════════\n');
});

socket.on('chat-mensaje', (mensaje) => {
  console.log('\n💬 EVENTO: chat-mensaje');
  console.log(`De: ${mensaje.usuarioNombre}`);
  console.log(`Mensaje: ${mensaje.mensaje}`);
  console.log(`Hora: ${new Date(mensaje.timestamp).toLocaleTimeString()}`);
  console.log('════════════════════════════════\n');
});

socket.on('stream-finalizado', (data) => {
  console.log('\n🏁 EVENTO: stream-finalizado');
  console.log('📦 Datos:', JSON.stringify(data, null, 2));
  console.log('════════════════════════════════\n');
});

socket.on('stream-finalizado-confirmado', (data) => {
  console.log('\n✅ EVENTO: stream-finalizado-confirmado');
  console.log('📦 Datos:', JSON.stringify(data, null, 2));
  console.log('════════════════════════════════\n');
  mostrarMenu();
});

socket.on('error', (error) => {
  console.error('\n❌ ERROR:', error);
  console.log('════════════════════════════════\n');
  mostrarMenu();
});

socket.on('disconnect', () => {
  console.log('\n🔌 Desconectado del servidor\n');
  process.exit(0);
});

function mostrarMenu() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         MENÚ DE COMANDOS                 ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  1 - Iniciar Stream                      ║');
  console.log('║  2 - Enviar mensaje de chat              ║');
  console.log('║  3 - Finalizar Stream                    ║');
  console.log('║  4 - Salir                               ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('\nEscribe el número y presiona Enter:\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (input) => {
  const opcion = input.trim();
  
  switch(opcion) {
    case '1':
      console.log('\n📡 Iniciando stream...\n');
      socket.emit('iniciar-stream', { mantenimientoId: MANTENIMIENTO_ID });
      break;
      
    case '2':
      rl.question('Escribe tu mensaje: ', (mensaje) => {
        console.log('\n💬 Enviando mensaje...\n');
        socket.emit('chat-mensaje', {
          mantenimientoId: MANTENIMIENTO_ID,
          mensaje: mensaje
        });
      });
      break;
      
    case '3':
      console.log('\n🏁 Finalizando stream...\n');
      socket.emit('finalizar-stream', { mantenimientoId: MANTENIMIENTO_ID });
      break;
      
    case '4':
      console.log('\n👋 Saliendo...\n');
      socket.disconnect();
      process.exit(0);
      break;
      
    default:
      console.log('\n❌ Opción inválida\n');
      mostrarMenu();
  }
});

console.log('Esperando conexión...\n');
