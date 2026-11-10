// Never imported: the package typecheck compiles it so that a browser Worker, adapted, must stay a MesherPort.
import type { MesherPort } from '@skelly/engine/mesh';
import { workerMesherPort } from './mesherPort.ts';

export const adaptedWorkerIsMesherPort = (worker: Worker): MesherPort => {
  const port: MesherPort = workerMesherPort(worker);
  return port;
};
