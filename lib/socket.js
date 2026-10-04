import { io } from 'socket.io-client';

let socket;

export function getSocket() {
  if (!socket) socket = io({ transports: ['websocket'] });
  return socket;
}

// Promise wrapper around acked events: resolves with `data`, rejects with the server error.
export function call(event, payload) {
  return new Promise((resolve, reject) => {
    getSocket().emit(event, payload, (res) => (res?.ok ? resolve(res.data) : reject(new Error(res?.error || 'Request failed'))));
  });
}
