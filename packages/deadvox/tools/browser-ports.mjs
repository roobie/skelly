// biome-ignore-all lint/correctness/noNodejsModules: this helper is used only by the opt-in Node browser contract
// Reserve both browser endpoints at once so an ephemeral port cannot be assigned twice.
import { createServer } from 'node:net';

const reservePort = (port = 0) =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not read the reserved browser port'));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });

export const reserveDistinctPorts = async ({ reserve = reservePort, port = 0, cdpPort = 0 } = {}) => {
  const vite = await reserve(port);
  let chrome;
  try {
    chrome = await reserve(cdpPort);
    if (vite.port === chrome.port) {
      throw new Error('Vite and Chrome debugging ports must differ');
    }
    return {
      port: vite.port,
      cdpPort: chrome.port,
      release: async () => Promise.all([vite.close(), chrome.close()]),
    };
  } catch (error) {
    await chrome?.close();
    await vite.close();
    throw error;
  }
};
