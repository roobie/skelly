// Never imported: deadvox's typecheck compiles it so that a browser Worker, adapted, must stay a MesherPort.
import type { MesherPort } from '../game/entries/mesh.ts';
import { workerMesherPort } from './mesherPort.ts';

export const adaptedWorkerIsMesherPort = (worker: Worker): MesherPort => {
  const port: MesherPort = workerMesherPort(worker);
  return port;
};
